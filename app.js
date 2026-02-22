// Last Updated: Production Stable
document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    // Update this URL if your backend is hosted elsewhere
    // If you are using Vercel, this won't work for WebSocket (requires serverless solution like Pusher). 
    // But since you have a Node server (Railway/Heroku/Render), this is fine.
    const API_URL = 'https://web-production-0f66c.up.railway.app/api';
    // const API_URL = '/api'; // Reverted: Relative path only works if served from same origin

    // --- PAGE ROUTER ---
    const isWhiteboard = document.querySelector('.tasks-grid');
    const isLoginPage = document.getElementById('login-form');

    // --- WHITEBOARD LOGIC ---
    if (isWhiteboard) {
        // --- State & DOM Elements (Whiteboard) ---
        const tasksGrid = document.querySelector('.tasks-grid');
        const dynamicCardColors = ['purple', 'orange', 'cyan', 'pink'];

        // --- Color Themes for Date Headers (Tone-on-Tone) ---
        const colorThemeMap = {
            'cyan': { text: '#117a8b', bg: 'rgba(23, 162, 184, 0.1)' },
            'green': { text: '#155724', bg: 'rgba(40, 167, 69, 0.1)' },
            'yellow': { text: '#856404', bg: 'rgba(255, 193, 7, 0.1)' },
            'purple': { text: '#3c1e70', bg: 'rgba(111, 66, 193, 0.1)' },
            'orange': { text: '#9e3f1b', bg: 'rgba(253, 126, 20, 0.1)' },
            'pink': { text: '#901842', bg: 'rgba(232, 62, 140, 0.1)' },
            'indigo': { text: '#3c1e70', bg: 'rgba(102, 16, 242, 0.1)' },
            'teal': { text: '#155724', bg: 'rgba(32, 201, 151, 0.1)' }
        };

        // --- Helper: Safe Date Parser ---
        // Handles MySQL format "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS"
        function safeDate(dateInput) {
            if (!dateInput) return null;
            if (dateInput instanceof Date) return dateInput;
            // If string contains space and no T, replace space with T
            if (typeof dateInput === 'string' && dateInput.includes(' ') && !dateInput.includes('T')) {
                return new Date(dateInput.replace(' ', 'T'));
            }
            return new Date(dateInput);
        }

        // --- Mobile Menu Logic ---
        const mobileMenuBtn = document.getElementById('mobile-menu-toggle');
        const sidebar = document.querySelector('.sidebar');
        const mobileOverlay = document.getElementById('mobile-overlay');
        const logoutBtn = document.getElementById('logout-btn');

        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                sidebar.classList.toggle('open');
                mobileOverlay.classList.toggle('active');
            });
        }

        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', () => {
                sidebar.classList.remove('open');
                mobileOverlay.classList.remove('active');
            });
        }

        // Status User Logic
        // --- Status Logic ---
        const statusPopup = document.getElementById('status-popup');
        let currentDot = null;
        const userStatusList = document.getElementById('user-status-list');

        // NEW: Cache for user data (ID -> Name mapping)
        let allUsersCache = {};


        const statusIcons = {
            'free': '⚡',
            'busy': '⛔',
            'meeting': '📅',
            'on-call': '📞',
            'away': '🚗💨',
            'break': '🍽️',
            'holiday': '🏖️',
            'offline': '💤'
        };

        async function loadUsers() {
            const users = await fetchUsers();
            userStatusList.innerHTML = '';

            const currentUser = JSON.parse(localStorage.getItem('user'));

            // Calculate Cutoff Time (Most recent 08:30 AM)
            const now = new Date();
            let cutoffTime = new Date();
            cutoffTime.setHours(8, 30, 0, 0);

            // If it's currently before 08:30 AM, the last reset was yesterday 08:30 AM
            if (now < cutoffTime) {
                cutoffTime.setDate(cutoffTime.getDate() - 1);
            }

            const onlineUsers = [];
            const offlineUsers = [];

            users.forEach(user => {
                // Populate cache
                allUsersCache[user.id] = user.name || user.email.split('@')[0];
                if (!allUsersCache[user.id]) {
                    allUsersCache[user.id] = "Unknown User";
                } else if (!user.name) {
                    allUsersCache[user.id] = allUsersCache[user.id].charAt(0).toUpperCase() + allUsersCache[user.id].slice(1);
                }

                // Determine Online/Offline status
                // Logic: If user has logged in since cutoffTime, they are "Online" in the list
                // OTHERWISE, they are "Offline".
                // EXCEPTION: If the user explicitly sets their status to 'offline' (via popup), they stay offline?
                // The request says: "For a person who does not relog after the reboot of 8:30, she is marked as offline until she relogs".
                // "And the list of offline is a list with names of people who did not relog... names are light and dot is black".
                // "until she relogs and the dot returns to green and she goes up to online list".

                // So, rely on `last_login`.
                // Note: user.last_login comes from DB as string or Date object depending on driver.
                // It might be null if never logged in or new field.

                let isOnline = false;
                if (user.last_login) {
                    const lastLoginDate = new Date(user.last_login);
                    if (lastLoginDate >= cutoffTime) {
                        isOnline = true;
                    }
                }

                // Also, if the user is using the app NOW, their status might be 'free', 'busy', etc.
                // But if they haven't logged in TODAY (since 8:30), we force them to appear offline visually 
                // regardless of their DB status? 
                // Yes, the request implies visual separation based on login time.
                // However, we should probably treat them as valid Online users if they ARE active.
                // The user's request is specific: "Users who don't relog... stay marked as offline".

                if (isOnline) {
                    onlineUsers.push(user);
                } else {
                    offlineUsers.push(user);
                }
            });

            // Helper to render a user item
            const renderUserItem = (user, isOfflineList = false) => {
                const li = document.createElement('li');
                let displayName = user.name || user.email.split('@')[0];
                if (!user.name) {
                    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                }
                const isMe = currentUser && user.id === currentUser.id;

                // If in Offline list, force black dot and specific style
                // If in Online list, use actual status

                let statusClass = isOfflineList ? 'status-offline' : `status-${user.status || 'free'}`;
                let statusIcon = isOfflineList ? '' : (statusIcons[user.status] || ''); // Hide icon for offline? Or use Zzz?

                // The user said: "dot marked as black... until she relogs and dot returns to green".
                // So visually override the dot class.

                if (isOfflineList) {
                    li.classList.add('user-offline'); // For opacity/dimming

                    // If manually offline but in offline list, use Zzz icon
                    if (user.status === 'offline') {
                        statusIcon = '💤';
                    }
                }

                li.innerHTML = `
                    <span class="status-dot ${statusClass}"></span>
                    <span>${displayName} ${isMe ? '(You)' : ''} ${statusIcon}</span>
                `;

                if (isMe) {
                    li.classList.add('current-user-item');
                    li.onclick = (e) => {
                        e.stopPropagation();
                        const textSpan = li.querySelector('span:last-child');
                        const rect = textSpan.getBoundingClientRect();
                        statusPopup.style.top = `${rect.top}px`;
                        statusPopup.style.left = `${rect.right + 10}px`;
                        statusPopup.classList.remove('hidden');
                        currentDot = li.querySelector('.status-dot');
                    };
                }
                return li;
            };

            // Render Online Users
            // Sort by name for now, or status? keeping simple
            onlineUsers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            if (onlineUsers.length > 0) {
                // Header for Online? Or just list them? 
                // Maybe a small separator if we have offline users too.
                // Let's just list them.
                onlineUsers.forEach(u => userStatusList.appendChild(renderUserItem(u, false)));
            }

            // Render Offline Users
            if (offlineUsers.length > 0) {
                offlineUsers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

                // Add specific Offline Header or Separator
                if (onlineUsers.length > 0) {
                    const separator = document.createElement('li');
                    separator.innerHTML = '<hr class="separator-hr">';
                    separator.classList.add('separator-item'); // distinct
                    userStatusList.appendChild(separator);

                    const offlineHeader = document.createElement('li');
                    offlineHeader.innerHTML = '<h4>OFFLINE</h4>';
                    offlineHeader.classList.add('offline-header-item');
                    userStatusList.appendChild(offlineHeader);
                }

                offlineUsers.forEach(u => userStatusList.appendChild(renderUserItem(u, true)));
            }
        }

        // Popup Selection
        statusPopup.querySelectorAll('li').forEach(item => {
            item.addEventListener('click', async () => {
                const newStatus = item.dataset.status;

                // Optimistic UI Update
                if (currentDot) {
                    // Generic update: wipes old status class and adds new one
                    currentDot.className = `status-dot status-${newStatus}`;
                }
                statusPopup.classList.add('hidden');

                // API Call
                await updateUserStatusAPI(newStatus);
                loadUsers(); // Refresh list to confirm
            });
        });

        window.addEventListener('click', () => {
            if (!statusPopup.classList.contains('hidden')) {
                statusPopup.classList.add('hidden');
            }
        });

        // Modal Elements
        const customConfirmModal = document.getElementById('custom-confirm-modal');
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
        const confirmModalText = document.getElementById('confirm-modal-text');
        let groupIdToDelete = null;

        const taskModal = document.getElementById('task-modal');
        const taskModalTitle = document.getElementById('task-modal-title');
        const taskTitleInput = document.getElementById('task-title-input');
        const taskTextInput = document.getElementById('task-text-input');
        const saveTaskBtn = document.getElementById('save-task-btn');
        const closeTaskModalBtn = document.getElementById('close-task-modal-btn');
        const completeTaskBtn = document.getElementById('complete-task-btn');
        const taskDates = document.getElementById('task-dates');
        const creationDateSpan = document.getElementById('creation-date');
        const completionDateSpan = document.getElementById('completion-date');

        const addStickerBtn = document.querySelector('.add-sticker-btn');
        const filterInput = document.getElementById('filter-input');

        let activeGroupId = null;
        let activeGroupIsIntro = false; // Flag to track if we are in intro mode
        let activeGroupHasSchedule = false; // Flag for groups that support scheduling
        let activeGroupType = 'standard'; // 'standard', 'intro', 'compact'
        let currentTaskData = null;

        // --- Fix for Navigation/Cache Restoration ---
        // Ensures data reloads when user navigates back to the page (handling bfcache)
        window.addEventListener('pageshow', (event) => {
            if (event.persisted) {
                console.log("Page restored from cache. Reloading data...");
                loadGroups();
                loadUsers();
            }
        });

        // Auto-Refresh every 5 seconds (5,000 ms) for near real-time updates
        setInterval(() => {
            // [FIX] Checking if user is currently renaming a group
            // If there is an input field inside a card-header, we skip the refresh to avoid overwriting their typing.
            const isRenaming = document.querySelector('.card-header input') !== null;
            if (isRenaming) {
                // console.log("Skipping refresh due to active rename...");
                return;
            }

            // console.log("Auto-refreshing tasks..."); // Less noise in console
            loadGroups();
            loadUsers();
            checkHolidayReturns(); // NEW: Check for holiday returns
        }, 5000); // 5 Seconds

        // NEW: Check for Holiday Returns (Run more frequently? Or just with auto-refresh)
        // Since auto-refresh is 10 mins, maybe we run this check every 60 seconds independently?
        // Let's add a separate interval for this to be more precise than 10 mins.
        setInterval(() => {
            checkHolidayReturns();
        }, 60000); // Check every 1 minute

        async function checkHolidayReturns() {
            // Find "Carers on Holiday" group using cache or fetch? 
            // We need fresh data. rely on `fetchGroups` inside or just use what we have?
            // `checkHolidayReturns` runs logic. Ideally it needs the tasks. 
            // We can fetch groups to be sure.
            try {
                // Helper to get fresh data silently
                const response = await fetch(`${API_URL}/groups`);
                if (!response.ok) return;
                const groups = await response.json();

                const holidayGroup = groups.find(g => g.name === 'Carers on Holiday');
                const sickGroup = groups.find(g => g.name === 'Sick Carers');

                const groupsToCheck = [];
                if (holidayGroup) groupsToCheck.push(holidayGroup);
                if (sickGroup) groupsToCheck.push(sickGroup);

                if (groupsToCheck.length === 0) return;

                const now = new Date();
                let hasUpdates = false;

                for (const group of groupsToCheck) {
                    const pendingTasks = group.tasks.filter(t => t.status !== 'done');

                    for (const task of pendingTasks) {
                        if (task.scheduled_at) {
                            const returnDate = safeDate(task.scheduled_at);
                            // If returnDate is valid and is in the PAST
                            if (returnDate && !isNaN(returnDate) && returnDate <= now) {
                                console.log(`Auto-completing holiday task: ${task.title}`);
                                // Mark as done
                                // We use a specific solution text to identify it was the system
                                await updateTaskStatusAPI(task.id, 'done', 'Automatic Return');

                                // Also set the completed_at date to NOW (which is the default if not sent, 
                                // but updateTaskStatusAPI usually just sets status. 
                                // Check updateTaskStatusAPI implementation... 
                                // It takes status and solution. It DOES NOT set completed_at automatically on backend 
                                // usually unless backend handles it. 
                                // Let's use `updateTaskAPI` if `updateTaskStatusAPI` is too simple?
                                // Actually `updateTaskStatusAPI` calls PATCH /tasks/:id with {status, solution}.
                                // The Backend likely sets completed_at if status becomes done.
                                // If not, we should send it.

                                // Let's verify updateTaskStatusAPI... it just sends body.
                                // To be safe, let's use `updateTaskAPI` to send completed_at too?
                                // Or trust the backend.
                                // Based on `completeTaskBtn` logic (line 1538), we manually send `completed_at`.

                                const mysqlDate = now.toISOString().slice(0, 19).replace('T', ' ');
                                await updateTaskAPI(task.id, {
                                    status: 'done',
                                    completed_at: mysqlDate,
                                    solution: 'Automatic Return'
                                });

                                hasUpdates = true;
                            }
                        }
                    }
                }

                if (hasUpdates) {
                    loadGroups(); // Refresh UI to show moves
                    showNotification('System: Carers marked as returned.', 'success');
                }

            } catch (err) {
                console.error("Error checking holidays:", err);
            }
        }

        // --- Daily Auto-Logout at 8:30 AM ---
        // --- Daily Auto-Logout at 8:30 AM ---
        function checkAutoLogout() {
            const now = new Date();
            const currentHours = now.getHours();
            const currentMinutes = now.getMinutes();

            // Logic: If it's 8:30 AM OR if we just opened the app and it's past 8:30 but before, say, 8:35 (or just strictly forced logout if we want to enforce it once a day).
            // However, a strict "past 8:30" rule might loop logout them out if they log in at 8:31. 
            // Better approach: Check if the last login was BEFORE today's 8:30 AM, and it is currenly PAST 8:30 AM.

            // For now, let's keep the user's simple rule but make it robust:
            // The user wants "logout after a certain time". The original code only checked for EXACTLY 8:30.
            // If the user opens the phone at 8:31, they are not logged out.

            // To fix this without complex session tracking, let's just ensure that if it is 08:30, we logout.
            // And maybe we can add a simple "Safety" check: If the app is open, run this check.

            if (currentHours === 8 && currentMinutes === 30) {
                performLogout('Daily Login Refresh (8:30 AM)\nPlease log in again to start your day.');
            }
        }

        function performLogout(message) {
            if (message) alert(message);
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            sessionStorage.removeItem('authToken');
            sessionStorage.removeItem('user');
            window.location.href = 'login.html';
        }

        setInterval(checkAutoLogout, 60000); // Check every minute
        checkAutoLogout(); // Check immediately on load too, just in case they open it right at 8:30
        async function setupFixedGroups() {
            // Ensure fixed groups exist in DB and update DOM with their real IDs
            const groups = await fetchGroups();

            // MIGRATION 1: Rename "Sick" to "Sick Carers"
            const manualSickGroup = groups.find(g => g.name === 'Sick');
            if (manualSickGroup) {
                console.log("Renaming 'Sick' -> 'Sick Carers'");
                await renameGroupAPI(manualSickGroup.id, 'Sick Carers');
                manualSickGroup.name = 'Sick Carers';
            }

            // MIGRATION 3: Rename "Sheets Needed" to "Log Sheets Needed"
            const sheetsGroup = groups.find(g => g.name === 'Sheets Needed');
            if (sheetsGroup) {
                console.log("Renaming 'Sheets Needed' -> 'Log Sheets Needed'");
                await renameGroupAPI(sheetsGroup.id, 'Log Sheets Needed');
                sheetsGroup.name = 'Log Sheets Needed';
            }

            // MIGRATION 2: Merge "Sick Carers Returned" (or Returned Sick Carers) INTO "Sick Carers"
            // We want ONE group. If the secondary group exists, move tasks and delete it.
            const secondaryGroup = groups.find(g => g.name === 'Sick Carers Returned') ||
                groups.find(g => g.name === 'Returned Sick Carers');

            let mainSickGroup = groups.find(g => g.name === 'Sick Carers');

            // If we have secondary but no main, rename secondary to main
            if (secondaryGroup && !mainSickGroup) {
                await renameGroupAPI(secondaryGroup.id, 'Sick Carers');
                mainSickGroup = secondaryGroup; // It is now the main group
            }
            // If we have both, move tasks from secondary to main, then delete secondary
            else if (secondaryGroup && mainSickGroup) {
                console.log("Merging Sick groups...");
                if (secondaryGroup.tasks && secondaryGroup.tasks.length > 0) {
                    for (const task of secondaryGroup.tasks) {
                        await updateTaskAPI(task.id, { group_id: mainSickGroup.id });
                    }
                }
                await deleteGroupAPI(secondaryGroup.id);
            }

            const fixedDefs = [
                { name: 'Introduction', selector: '[data-group="introduction"]', color: 'cyan' },
                { name: 'Introduction (Schedule)', selector: '[data-group="introduction"]', color: 'cyan' },
                { name: 'Coordinators', selector: '[data-group="coordinators"]', color: 'pink' },
                { name: 'Supervisors', selector: '[data-group="supervisors"]', color: 'green' },
                { name: 'Log Sheets Needed', selector: '[data-group="sheets-needed"]', color: 'purple' },
                { name: 'Sick Carers', selector: '[data-group="sick-carers"]', color: 'orange' },
                { name: 'Carers on Holiday', selector: '[data-group="holiday"]', color: 'indigo' },
                { name: 'Extra To Do', selector: '[data-group="extra"]', color: 'teal' }
            ];

            for (const def of fixedDefs) {
                // Approximate match for Intro to avoid creating duplicates if one exists
                let dbGroup = groups.find(g => g.name === def.name);
                if (def.name.startsWith('Introduction')) {
                    dbGroup = groups.find(g => g.name === 'Introduction' || g.name === 'Introduction (Schedule)');
                } else if (def.name === 'Sick Carers') {
                    dbGroup = groups.find(g => g.name === 'Sick Carers');
                }

                // If not found, create them to avoid 500 errors.
                if (!dbGroup) {
                    console.log(`Creating missing fixed group: ${def.name}`);
                    dbGroup = await createGroupAPI(def.name, def.color);
                }

                if (dbGroup) {
                    // Update all cards that were hardcoded with the string ID
                    const cards = document.querySelectorAll(def.selector);
                    if (cards.length > 0) {
                        cards.forEach(card => {
                            card.dataset.group = dbGroup.id; // Set REAL NUMERIC ID
                            card.dataset.color = def.color;
                            card.classList.remove('hidden');
                        });
                    } else {
                        console.warn(`Hardcoded card for ${def.name} not found.`);
                    }
                }
            }
        }

        // --- API Interactions ---
        async function fetchGroups() {
            try {
                const response = await fetch(`${API_URL}/groups`);
                if (!response.ok) throw new Error('Failed to fetch groups');
                return await response.json();
            } catch (error) {
                console.error(error);
                return [];
            }
        }

        async function createGroupAPI(name, color) {
            try {
                const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
                const response = await fetch(`${API_URL}/groups`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name, color })
                });
                if (!response.ok) throw new Error('Failed to create group');
                return await response.json();
            } catch (error) {
                console.error(error);
                return null;
            }
        }

        async function deleteGroupAPI(id) {
            try {
                const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
                const response = await fetch(`${API_URL}/groups/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (!response.ok) throw new Error('Failed to delete group');
                return true;
            } catch (error) {
                console.error(error);
                return false;
            }
        }

        async function renameGroupAPI(id, newName) {
            try {
                const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
                const response = await fetch(`${API_URL}/groups/${id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name: newName })
                });
                if (!response.ok) throw new Error('Failed to rename group');
            } catch (error) {
                console.error(error);
            }
        }

        async function createTaskAPI(task) {
            // No try-catch here so errors propagate to the caller (save button)
            const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
            const response = await fetch(`${API_URL}/tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(task)
            });
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    alert("Session expired. Please log in again.");
                    window.location.href = 'login.html';
                    return null;
                }
                const errText = await response.text();
                throw new Error(`Server Error: ${response.status} ${errText}`);
            }
            return await response.json();
        }

        async function updateTaskAPI(id, updates) {
            try {
                const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
                const response = await fetch(`${API_URL}/tasks/${id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(updates)
                });
                if (!response.ok) throw new Error('Failed to update task');
                return true;
            } catch (error) {
                console.error(error);
                return false;
            }
        }

        async function deleteTaskAPI(taskId) {
            try {
                const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
                const response = await fetch(`${API_URL}/tasks/${taskId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`Failed to delete task: ${response.status}`);
                }

                return true;
            } catch (error) {
                console.error(error);
                return false;
            }
        }

        async function updateTaskStatusAPI(taskId, status, solution = null) {
            const body = { status };
            if (solution !== null) body.solution = solution;

            try {
                const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
                const response = await fetch(`${API_URL}/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(body)
                });
                if (!response.ok) throw new Error('Failed to update task status');
                return true;
            } catch (error) {
                console.error(error);
                return false;
            }
        }

        async function fetchUsers() {
            try {
                const response = await fetch(`${API_URL}/users`);
                if (!response.ok) return [];
                return await response.json();
            } catch (error) {
                console.error(error);
                return [];
            }
        }

        async function updateUserStatusAPI(status) {
            const token = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_URL}/users/status`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ status })
                });

                if (response.status === 401) {
                    alert('Session expired. Please login again.');
                    window.location.href = 'login.html';
                    return false;
                }

                if (!response.ok) throw new Error('Failed to update status');
                return true;
            } catch (error) {
                console.error(error);
                return false;
            }
        }

        // --- Rendering Logic ---
        // --- Rendering Logic ---
        async function loadGroups() {
            const groups = await fetchGroups();

            // Identify Fixed Group IDs
            const coordGroup = groups.find(g => g.name === 'Coordinators');
            const hospitalGroup = groups.find(g => g.name === 'Admitted to Hospital') || groups.find(g => g.name === 'Hospital');
            const superGroup = groups.find(g => g.name === 'Supervisors');
            const introGroup = groups.find(g => g.name === 'Introduction' || g.name === 'Introduction (Schedule)');
            const sheetsGroup = groups.find(g => g.name === 'Log Sheets Needed') || groups.find(g => g.name === 'Sheets Needed');
            const sickGroup = groups.find(g => g.name === 'Sick Carers');
            // Try strict match first, then case-insensitive to catch user variations
            const sickReturnedGroup = groups.find(g => g.name === 'Returned Sick Carers') ||
                groups.find(g => g.name === 'Sick Carers Returned') ||
                groups.find(g => g.name.toLowerCase().includes('returned sick carers'));
            const carersComeInGroup = groups.find(g => g.name === 'Carers to come in');
            const holidayGroup = groups.find(g => g.name === 'Carers on Holiday');
            const extraGroup = groups.find(g => g.name === 'Extra To Do');

            // [NEW] CRITICAL: Associate Numeric IDs to Hardcoded Cards BEFORE rendering
            if (hospitalGroup) document.querySelectorAll('[data-group="hospital"]').forEach(c => c.dataset.group = hospitalGroup.id);
            if (coordGroup) document.querySelectorAll('[data-group="coordinators"]').forEach(c => c.dataset.group = coordGroup.id);
            if (superGroup) document.querySelectorAll('[data-group="supervisors"]').forEach(c => c.dataset.group = superGroup.id);
            if (introGroup) document.querySelectorAll('[data-group="introduction"]').forEach(c => c.dataset.group = introGroup.id);
            if (sheetsGroup) document.querySelectorAll('[data-group="sheets-needed"]').forEach(c => c.dataset.group = sheetsGroup.id);
            if (sickGroup) document.querySelectorAll('[data-group="sick-carers"]').forEach(c => c.dataset.group = sickGroup.id);
            if (holidayGroup) document.querySelectorAll('[data-group="holiday"]').forEach(c => c.dataset.group = holidayGroup.id);
            if (extraGroup) document.querySelectorAll('[data-group="extra"]').forEach(c => c.dataset.group = extraGroup.id);

            const fixedIds = [
                coordGroup?.id,
                hospitalGroup?.id,
                superGroup?.id,
                introGroup?.id,
                sheetsGroup?.id,
                sickGroup?.id,
                sickReturnedGroup?.id,
                holidayGroup?.id,
                extraGroup?.id
            ].filter(id => id);

            // [FIX] Force Colors for Fixed Groups in Memory if missing (or override as requested)
            if (coordGroup && !coordGroup.color) coordGroup.color = 'pink';
            if (hospitalGroup && !hospitalGroup.color) hospitalGroup.color = 'pink'; // Hospital now pink as requested
            if (superGroup && !superGroup.color) superGroup.color = 'green';
            if (introGroup && !introGroup.color) introGroup.color = 'cyan';
            if (sheetsGroup && !sheetsGroup.color) sheetsGroup.color = 'purple';
            // User requested BLUE (Cyan) for Sick Carers and Returned
            if (sickGroup && !sickGroup.color) sickGroup.color = 'orange';
            if (sickReturnedGroup) sickReturnedGroup.color = 'cyan';
            if (carersComeInGroup && !carersComeInGroup.color) carersComeInGroup.color = 'pink';
            if (holidayGroup && !holidayGroup.color) holidayGroup.color = 'indigo';
            if (extraGroup && !extraGroup.color) extraGroup.color = 'teal';

            // 1. Clear tasks from FIXED cards
            document.querySelectorAll('.non-deletable ul').forEach(ul => ul.innerHTML = '');

            // 2. Remove DYNAMIC cards (those that are not in fixedIds)
            const dynamicCards = document.querySelectorAll('.task-card:not(.non-deletable)');
            dynamicCards.forEach(card => card.remove());

            // 3. Render Groups
            groups.forEach(group => {
                if (fixedIds.includes(group.id)) {
                    // It's a fixed group, just render its tasks into existing DOM
                    if (group.name === 'Introduction' || group.name === 'Introduction (Schedule)') {
                        renderIntroductionTasks(group);
                    } else {
                        renderFixedGroupTasks(group);
                    }
                } else {
                    // Check for Fixed Groups that didn't match ID but match Name (Duplicates or Initial Load Mismatch)
                    const lowerName = group.name.trim().toLowerCase();

                    if (lowerName.includes('introduction')) {
                        console.log("Found floating Introduction group, forcing render as fixed.");
                        renderIntroductionTasks(group);
                        const hardcodedCards = document.querySelectorAll('[data-group="introduction"]');
                        hardcodedCards.forEach(card => card.dataset.group = group.id);

                    } else if (
                        lowerName === 'sick carers' ||
                        lowerName === 'returned sick carers' ||
                        lowerName === 'sick carers returned'
                    ) {
                        console.log(`Found floating fixed group ${group.name}, forcing render as fixed.`);
                        renderFixedGroupTasks(group);

                        // Bind to correct DOM element
                        let selector = lowerName.includes('returned') ? '[data-group="sick-carers-returned"]' : '[data-group="sick-carers"]';
                        const hardcodedCards = document.querySelectorAll(selector);
                        hardcodedCards.forEach(card => card.dataset.group = group.id);

                    } else if (lowerName === 'carers on holiday' || lowerName === 'carers returning from holiday') {
                        console.log(`Found floating fixed group ${group.name}, forcing render as fixed.`);
                        renderFixedGroupTasks(group);
                        const hardcodedCards = document.querySelectorAll('[data-group="holiday"]');
                        hardcodedCards.forEach(card => card.dataset.group = group.id);

                    } else if (lowerName === 'admitted to hospital' || lowerName === 'returned from hospital' || lowerName === 'hospital') {
                        renderFixedGroupTasks(group);
                    } else if (lowerName === 'coordinators') {
                        renderFixedGroupTasks(group);
                    } else if (lowerName === 'supervisors') {
                        renderFixedGroupTasks(group);
                    } else if (lowerName === 'log sheets needed' || lowerName === 'sheets needed' || lowerName === 'log sheets delivered') {
                        renderFixedGroupTasks(group);
                    } else if (lowerName === 'extra to do' || lowerName === 'extra done') {
                        renderFixedGroupTasks(group);

                    } else if (
                        group.name === 'Carer Sick' ||
                        group.name === 'Returned Carers' ||
                        group.name === 'Cuidadores que retornaram'
                    ) {
                        // AUTO-DELETE CLEANUP
                        console.log(`Auto-deleting requested group: ${group.name}`);
                        deleteGroupAPI(group.id);
                    } else {
                        // Truly dynamic group
                        renderGroup(group);
                    }
                }
            });
        }

        function renderIntroductionTasks(group) {
            // Separar tarefas
            const todoTasks = group.tasks.filter(t => t.status !== 'done');
            const doneTasks = group.tasks.filter(t => t.status === 'done');

            // Renderizar ToDo
            const todoContainer = document.querySelector(`.task-card[data-group="${group.id}"][data-type="todo"] ul`);
            if (todoContainer) {
                // [REVERTED] User confirmed Introduction (Schedule) was correct.
                renderGroupedList(todoContainer, todoTasks, 'scheduled_at', 'asc', 'intro', 'cyan');
            }

            // Renderizar Done
            const doneContainer = document.querySelector(`.task-card[data-group="${group.id}"][data-type="done"] ul`);
            if (doneContainer) {
                // [CHANGED] User requested Inverted Sort (Newest First) for TASKS DONE
                renderGroupedList(doneContainer, doneTasks, 'scheduled_at', 'desc', 'intro', 'cyan');
            }
        }

        // Generic Renderer with Date Headers
        function renderGroupedList(container, tasks, dateField, sortOrder = 'desc', renderMode = 'standard', groupColor = 'cyan') {
            container.innerHTML = '';

            const theme = colorThemeMap[groupColor] || colorThemeMap['cyan'];

            tasks.sort((a, b) => {
                const dateA = safeDate(a[dateField]) || (sortOrder === 'asc' ? new Date('9999-12-31') : new Date('0000-01-01'));
                const dateB = safeDate(b[dateField]) || (sortOrder === 'asc' ? new Date('9999-12-31') : new Date('0000-01-01')); // Handle nulls

                // Safe parsing for subtraction
                const valA = dateA instanceof Date ? dateA.getTime() : 0;
                const valB = dateB instanceof Date ? dateB.getTime() : 0;

                return sortOrder === 'asc' ? valA - valB : valB - valA;
            });

            let lastDateStr = null;

            tasks.forEach(task => {
                const dateObj = safeDate(task[dateField]);
                let isValidDate = dateObj && !isNaN(dateObj.getTime());

                // For schedule, required. For others, optional but if missing, put in "No Date" bucket or just render?
                // If invalid date in 'created_at' (shouldn't happen), treat as no header?

                if (isValidDate) {
                    const year = String(dateObj.getFullYear()).slice(-2); // Get last 2 digits
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const weekday = dateObj.toLocaleDateString('en-GB', { weekday: 'long' });

                    // Requested format: DD/MM/YY - Weekday
                    const dayStr = `${day}/${month}/${year} - ${weekday}`;

                    if (dayStr !== lastDateStr) {
                        const header = document.createElement('li');
                        header.className = 'date-header';
                        header.innerHTML = `📅 ${dayStr.charAt(0).toUpperCase() + dayStr.slice(1)}`;
                        container.appendChild(header);
                        lastDateStr = dayStr;
                    }
                }

                const taskEl = createTaskElement(task, renderMode);
                container.appendChild(taskEl);
            });
        }

        function renderFixedGroupTasks(group) {
            // Find ALL DOM elements for this group
            const todoCards = document.querySelectorAll(`.task-card[data-group="${group.id}"][data-type="todo"]`);
            const doneCards = document.querySelectorAll(`.task-card[data-group="${group.id}"][data-type="done"]`);

            // Determine color based on name if group.color is missing (Legacy Fix)
            let groupColor = group.color;
            if (!groupColor) {
                if (group.name === 'Coordinators') groupColor = 'pink';
                else if (group.name === 'Supervisors') groupColor = 'green';
                else if (group.name === 'Log Sheets Needed' || group.name === 'Sheets Needed') groupColor = 'purple';
                else if (group.name.includes('Introduction')) groupColor = 'cyan';
                else if (group.name === 'Sick Carers') groupColor = 'orange';
                else if (group.name === 'Carers on Holiday') groupColor = 'indigo';
            }

            // Check if this group should be schedule-based
            const isScheduleGroup = group.name.includes('Introduction') ||
                group.name === 'Sick Carers' ||
                group.name === 'Coordinators' ||
                group.name === 'Admitted to Hospital' ||
                group.name === 'Carers on Holiday';

            const todoTasks = group.tasks.filter(t => t.status !== 'done');
            const doneTasks = group.tasks.filter(t => t.status === 'done');

            // Render into ALL matching cards
            todoCards.forEach(card => {
                const container = card.querySelector('ul');
                let renderMode = 'standard';
                if (group.name.includes('Introduction')) renderMode = 'intro';
                else if (group.name === 'Coordinators' || card.querySelector('h3').innerText.includes('Hospital')) renderMode = 'compact';
                else if (group.name === 'Carers on Holiday' || group.name === 'Sick Carers') renderMode = 'holiday';

                const color = card.dataset.color || groupColor; // Use card's own color attribute if set
                renderGroupedList(container, todoTasks, isScheduleGroup ? 'scheduled_at' : 'created_at', isScheduleGroup ? 'asc' : 'desc', renderMode, color);
            });

            doneCards.forEach(card => {
                const container = card.querySelector('ul');
                let renderMode = 'standard';
                if (group.name.includes('Introduction')) renderMode = 'intro';
                else if (group.name === 'Coordinators' || card.querySelector('h3').innerText.includes('Hospital')) renderMode = 'compact';
                else if (group.name === 'Carers on Holiday' || group.name === 'Sick Carers') renderMode = 'holiday';

                const color = card.dataset.color || groupColor;
                renderGroupedList(container, doneTasks, isScheduleGroup ? 'scheduled_at' : 'completed_at', 'desc', renderMode, color);
            });
        }

        // --- Logout Logic ---
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                performLogout();
            });
        }

        function renderGroup(group) {
            const todoCard = createCardElement(group, 'todo');
            const doneCard = createCardElement(group, 'done');
            tasksGrid.appendChild(todoCard);
            tasksGrid.appendChild(doneCard);

            const todoList = todoCard.querySelector('ul');
            const doneList = doneCard.querySelector('ul');

            // ToDo: Group by Created At (Newest First)
            const todoTasks = group.tasks.filter(t => t.status !== 'done');
            renderGroupedList(todoList, todoTasks, 'created_at', 'desc', 'standard', group.color);

            // Done: Group by Completed At (Newest First)
            const doneTasks = group.tasks.filter(t => t.status === 'done');
            renderGroupedList(doneList, doneTasks, 'completed_at', 'desc', 'standard', group.color);
        }

        function createCardElement(group, type) {
            const div = document.createElement('div');
            div.className = 'task-card';
            div.dataset.group = group.id;
            div.dataset.type = type;
            div.dataset.color = group.color;

            const titlePrefix = type === 'todo' ? 'To Do' : 'Tasks done';

            // Failsafe: Never allow delete button for fixed groups even if rendered dynamically
            let isProtected = group.name.toLowerCase().includes('introduction') ||
                group.name === 'Coordinators' ||
                group.name === 'Supervisors' ||
                group.name === 'Log Sheets Needed' ||
                group.name === 'Sheets Needed' ||
                group.name === 'Sick Carers' ||
                group.name === 'Sick Carers Returned' ||
                group.name === 'Carers to come in' ||
                group.name === 'Carers on Holiday' ||
                group.name === 'Extra To Do';

            const deleteBtnHTML = isProtected ? '' : `<button class="delete-sticker-btn">&times;</button>`;
            const addTaskBtnHTML = type === 'todo' ? `<button class="add-task-item-btn">+</button>` : '';

            div.innerHTML = `
                ${deleteBtnHTML}
                <div class="card-header">
                    <h3>${titlePrefix} - ${group.name}</h3>
                    ${addTaskBtnHTML}
                </div>
                <ul></ul>
            `;
            return div;
        }

        function createTaskElement(task, renderMode = 'standard') {
            const li = document.createElement('li');
            li.dataset.id = task.id;
            li.dataset.text = task.description || '';
            li.dataset.creationDate = task.created_at;
            li.dataset.completionDate = task.completed_at || '';
            li.dataset.priority = task.priority;
            li.dataset.title = task.title;
            li.dataset.solution = task.solution || '';
            li.dataset.created_by = task.created_by || '';
            li.dataset.completed_by = task.completed_by || ''; // NEW: Tracking completion user
            li.dataset.scheduled_at = task.scheduled_at || '';

            const creationDateObj = safeDate(task.created_at);
            const creationDate = (creationDateObj && !isNaN(creationDateObj)) ? creationDateObj.toLocaleDateString('en-GB') : '';

            // --- Safe Element Creation (Anti-XSS) ---

            // Priority Dot
            const dot = document.createElement('span');
            dot.className = `task-item-priority-dot ${task.priority}`;

            // Title Container
            const titleContainer = document.createElement('div');
            // Check for intro/compact mode (Vertical layout)
            if (renderMode === 'intro' || renderMode === 'compact' || renderMode === 'holiday') {
                titleContainer.style.cssText = "display:flex; flex-direction:column; width:100%;";
                // Top Row (Time + Client)
                const topRow = document.createElement('div');
                topRow.style.cssText = "display:flex; align-items:center; font-size:1.1em; margin-bottom:2px;";

                let timeStr = "--:--";
                if (task.scheduled_at) {
                    const dateObj = safeDate(task.scheduled_at);
                    if (!isNaN(dateObj.getTime())) {
                        timeStr = dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                    }
                }

                // Add Dot to Top Row
                topRow.appendChild(dot);

                const titleText = document.createElement('strong');
                if (renderMode === 'holiday') {
                    titleText.textContent = task.title;
                } else {
                    titleText.textContent = `${timeStr} - ${task.title}`; // Safe text assignment
                }
                topRow.appendChild(titleText);

                // Bottom Row (Caregiver / Description)
                const bottomRow = document.createElement('div');
                bottomRow.style.cssText = "font-size:0.9em; color:#555; margin-left:22px;";

                if (renderMode === 'holiday') {
                    // Parse Dates
                    let rawDesc = task.description || '';
                    let startDateStr = '??/??';
                    let obsText = rawDesc;

                    const startMatch = rawDesc.match(/^\[Start: (\d{4}-\d{2}-\d{2})\]\s*(.*)/s);
                    if (startMatch) {
                        const sDate = new Date(startMatch[1]);
                        if (!isNaN(sDate)) startDateStr = sDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
                        obsText = startMatch[2];
                    }

                    let returnDateStr = '??/??';
                    if (task.scheduled_at) {
                        const rDate = safeDate(task.scheduled_at);
                        if (rDate && !isNaN(rDate)) returnDateStr = rDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
                    }

                    // Standard text format
                    bottomRow.innerHTML = `Start: ${startDateStr} - Return: ${returnDateStr}`;
                    // HIDDEN as per request: Observation text only visible in detail view
                    // if (obsText) {
                    //    bottomRow.innerHTML += `<div style="font-style:italic; color:#777; margin-top:2px;">${obsText}</div>`;
                    // }

                } else if (renderMode === 'intro') {
                    bottomRow.textContent = `Carer Name: ${task.description}`;
                } else if (renderMode === 'compact') {
                    // Logic: Truncate description to 3-4 words + "..."
                    // Also NO "Carer Name:" prefix
                    let descObj = task.description || '';
                    if (descObj) {
                        const words = descObj.split(/\s+/); // Split by whitespace
                        if (words.length > 4) {
                            bottomRow.textContent = words.slice(0, 4).join(' ') + '...';
                        } else {
                            bottomRow.textContent = descObj;
                        }
                    } else {
                        bottomRow.textContent = '';
                    }
                }

                titleContainer.appendChild(topRow);
                titleContainer.appendChild(bottomRow);

                li.appendChild(titleContainer);

            } else {
                // Standard Mode (Horizontal)
                li.style.display = 'flex';
                li.style.alignItems = 'center';

                li.appendChild(dot);

                const textSpan = document.createElement('span');
                const titleStrong = document.createElement('strong');
                titleStrong.textContent = task.title; // Safe
                textSpan.appendChild(titleStrong);

                // Completion/Creation Date Text
                const dateText = document.createElement('span');
                dateText.style.cssText = "font-size: 0.8em; color: #666; font-style: italic;";
                if (task.completed_at) {
                    const compDateObj = safeDate(task.completed_at);
                    if (compDateObj && !isNaN(compDateObj)) {
                        dateText.textContent = ` - completed on ${compDateObj.toLocaleDateString('en-GB')}`;
                    } else {
                        dateText.textContent = ` - completed`;
                    }
                } else {
                    dateText.textContent = ` - added on ${creationDate}`;
                }
                textSpan.appendChild(dateText);

                li.appendChild(textSpan);
            }


            return li;
        }



        window.addEventListener('click', () => {
            if (!statusPopup.classList.contains('hidden')) {
                statusPopup.classList.add('hidden');
            }
        });

        // --- Event Listeners (Global Grid) ---
        addStickerBtn.addEventListener('click', async () => {
            const timestamp = new Date().getTime().toString().slice(-4);
            const name = `Group ${timestamp}`;
            const color = dynamicCardColors[Math.floor(Math.random() * dynamicCardColors.length)];

            const newGroup = await createGroupAPI(name, color);
            if (newGroup) {
                renderGroup(newGroup);
            }
        });

        tasksGrid.addEventListener('click', (e) => {
            const target = e.target;

            if (target.classList.contains('delete-sticker-btn')) {
                const card = target.closest('.task-card');
                if (card) {
                    groupIdToDelete = card.dataset.group;
                    confirmModalText.textContent = 'Are you sure you want to delete this entire group and all its tasks?';
                    customConfirmModal.classList.remove('hidden');
                }
            }
            else if (target.classList.contains('add-task-item-btn')) {
                const card = target.closest('.task-card');
                if (card) {
                    activeGroupId = card.dataset.group;
                    // Check if it's introduction group
                    // Robust check: Check name in H3 or data-group match
                    // Check if it's introduction group or other schedule groups
                    const groupTitle = card.querySelector('.card-header h3').innerText.toLowerCase();

                    if (groupTitle.includes('introduction')) {
                        activeGroupIsIntro = true;
                        activeGroupType = 'intro';
                    } else if (groupTitle.includes('admitted to hospital')) {
                        activeGroupIsIntro = false;
                        activeGroupType = 'compact'; // Hospital
                    } else if (groupTitle.includes('sick carers')) {
                        activeGroupIsIntro = false;
                        activeGroupType = 'holiday'; // Sick Carers now uses Holiday UI
                    } else if (groupTitle.includes('carers on holiday')) {
                        activeGroupIsIntro = false;
                        activeGroupType = 'holiday';
                    } else {
                        activeGroupIsIntro = false;
                        activeGroupType = 'standard';
                    }

                    // New: Check if group supports schedule (Intro, Sick Carers, Admitted to Hospital)
                    if (activeGroupIsIntro ||
                        groupTitle.includes('sick carers') ||
                        groupTitle.includes('admitted to hospital') ||
                        groupTitle.includes('carers to come in') ||
                        groupTitle.includes('carers on holiday')) {
                        activeGroupHasSchedule = true;
                    } else {
                        activeGroupHasSchedule = false;
                    }
                    showTaskModal('create');
                }
            }
            else if (target.closest('li')) {
                const li = target.closest('li');
                const card = li.closest('.task-card');

                currentTaskData = {
                    id: li.dataset.id,
                    title: li.dataset.title,
                    description: li.dataset.text,
                    created_at: li.dataset.creationDate,
                    completed_at: li.dataset.completionDate,
                    priority: li.dataset.priority,
                    status: card.dataset.type === 'done' ? 'done' : 'todo',
                    solution: li.dataset.solution,
                    status: card.dataset.type === 'done' ? 'done' : 'todo',
                    solution: li.dataset.solution,
                    created_by: li.dataset.created_by, // Retrieve ownership info
                    completed_by: li.dataset.completed_by || null, // NEW
                    scheduled_at: li.dataset.scheduled_at || null // NEW
                };

                // Determine if this task belongs to Introduction group
                const groupName = card.querySelector('h3').textContent;
                activeGroupIsIntro = groupName.includes('Introduction');

                showTaskModal('view');
            }
        });

        // --- Rename Logic ---
        tasksGrid.addEventListener('dblclick', (e) => {
            const target = e.target;
            if (target.tagName === 'H3') {
                // Protect fixed groups from renaming (e.g. Coordinators with custom headers)
                if (target.closest('.non-deletable')) return;

                const cardHeader = target.parentElement;
                const currentTitle = target.textContent;
                const prefix = currentTitle.startsWith('To Do') ? 'To Do - ' : 'Tasks done - ';
                const baseTitle = currentTitle.replace(prefix, '');

                const input = document.createElement('input');
                input.type = 'text';
                input.value = baseTitle;
                input.className = 'title-edit-input';

                cardHeader.replaceChild(input, target);
                input.focus();

                const saveTitle = async () => {
                    const newBaseTitle = input.value.trim();
                    const card = cardHeader.closest('.task-card');
                    const groupId = card.dataset.group;

                    if (newBaseTitle) {
                        const newH3 = document.createElement('h3');
                        newH3.textContent = prefix + newBaseTitle;
                        cardHeader.replaceChild(newH3, input);

                        const otherType = card.dataset.type === 'todo' ? 'done' : 'todo';
                        const otherCard = document.querySelector(`.task-card[data-group="${groupId}"][data-type="${otherType}"]`);
                        if (otherCard) {
                            const otherH3 = otherCard.querySelector('h3');
                            const otherPrefix = otherType === 'todo' ? 'To Do - ' : 'Tasks done - ';
                            otherH3.textContent = otherPrefix + newBaseTitle;
                        }

                        await renameGroupAPI(groupId, newBaseTitle);
                    } else {
                        const oldH3 = document.createElement('h3');
                        oldH3.textContent = currentTitle;
                        cardHeader.replaceChild(oldH3, input);
                    }
                };

                input.addEventListener('blur', saveTitle);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') saveTitle();
                });
            }
        });

        // --- Confirm Delete Modal ---
        confirmDeleteBtn.addEventListener('click', async () => {
            // Case 1: Deleting a Group
            if (groupIdToDelete) {
                const success = await deleteGroupAPI(groupIdToDelete);
                if (success) {
                    const cards = document.querySelectorAll(`.task-card[data-group="${groupIdToDelete}"]`);
                    cards.forEach(card => card.remove());
                }
                groupIdToDelete = null;
            }
            // Case 2: Deleting a Task (New)
            else if (window.pendingDeleteTaskId) {
                const success = await deleteTaskAPI(window.pendingDeleteTaskId); // Need to implement this
                if (success) {
                    loadGroups(); // Refresh to remove from UI
                    showNotification('Task deleted.', 'success');
                }
                window.pendingDeleteTaskId = null;
            }

            customConfirmModal.classList.add('hidden');
        });

        cancelDeleteBtn.addEventListener('click', () => {
            customConfirmModal.classList.add('hidden');
            groupIdToDelete = null;
            window.pendingDeleteTaskId = null;
        });

        // --- Task Modal ---
        function showTaskModal(mode) {
            taskModal.classList.remove('hidden');

            if (mode === 'create') {
                taskModalTitle.textContent = 'New Task';
                taskTitleInput.value = '';
                taskTextInput.value = '';
                taskTitleInput.readOnly = false;
                taskTextInput.readOnly = false;

                saveTaskBtn.classList.remove('hidden');
                saveTaskBtn.textContent = 'Save Task'; // Ensure text is reset
                completeTaskBtn.classList.add('hidden');
                taskDates.classList.add('hidden');
                // Hide solution in create mode
                document.getElementById('solution-label').classList.add('hidden');
                document.getElementById('task-solution-input').classList.add('hidden');
                document.getElementById('task-solution-input').value = '';
                document.getElementById('delete-task-btn').classList.add('hidden');

                // Handle Schedule Input
                const scheduleContainer = document.getElementById('schedule-container');
                const scheduleInput = document.getElementById('task-schedule-input');

                if (activeGroupHasSchedule) {
                    scheduleContainer.classList.remove('hidden');
                    taskTextInput.classList.remove('hidden');
                    scheduleInput.value = ''; // Reset
                    scheduleInput.readOnly = false; // Ensure editable!

                    if (activeGroupType === 'intro') {
                        taskTitleInput.placeholder = "Client Name";
                        taskTextInput.placeholder = "Carer Name";
                    } else if (activeGroupType === 'compact') {
                        // Check specifically which compact type (Hospital or Sick)
                        // We can infer from activeGroupId lookup or just check activeGroupType + some context?
                        // Current logic: 'compact' covers both. But they have different placeholders.
                        // Let's re-check the group title logic or store a subtype?
                        // Or just check activeGroupId again?

                        // Let's use the DOM to be safe since we are in the modal setup phase
                        // Actually better to refine activeGroupType logic or specific flags.
                        // Let's check the container triggers or store a specific label.
                        // Or hack: check activeGroupHasSchedule and if it's NOT intro...

                        // Wait, we defined:
                        // Hospital -> "Client Name"
                        // Sick Carers -> "Carer Name"

                        // We need to know WHICH compact one it is.
                        // Let's use the activeGroupId to find the group name from DOM?
                        const groupCard = document.querySelector(`.task-card[data-group="${activeGroupId}"]`);
                        const groupName = groupCard ? groupCard.querySelector('h3').innerText.toLowerCase() : '';

                        if (groupName.includes('admitted to hospital')) {
                            taskTitleInput.placeholder = "Client Name";
                            taskTextInput.placeholder = "Description";
                        } else if (groupName.includes('sick carers')) {
                            taskTitleInput.placeholder = "Carer Name";
                            taskTextInput.placeholder = "Description";
                        } else {
                            taskTitleInput.placeholder = "Task Title";
                            taskTextInput.placeholder = "Task description...";
                        }

                    } else {
                        // Default placeholders for other schedule groups
                        taskTitleInput.placeholder = "Task Title";
                        taskTextInput.placeholder = "Task description...";
                    }
                } else {
                    scheduleContainer.classList.add('hidden');
                    taskTextInput.classList.remove('hidden');
                    taskTitleInput.placeholder = "Task Title";
                    taskTextInput.placeholder = "Task description...";
                }

                // --- Holiday Special Inputs ---
                const startDateContainer = document.getElementById('start-date-container');
                const startDateInput = document.getElementById('task-start-input');
                const scheduleLabel = document.getElementById('schedule-label');

                if (activeGroupType === 'holiday') {
                    startDateContainer.classList.remove('hidden');
                    startDateInput.value = ''; // Reset
                    scheduleLabel.textContent = 'Return Date:';
                    taskTitleInput.placeholder = "Carer Name";
                    taskTextInput.placeholder = "Observation (e.g. Vacation details)";
                } else {
                    startDateContainer.classList.add('hidden');
                    scheduleLabel.textContent = 'Scheduled Date & Time:';
                }

            } else if (mode === 'view') {
                taskModalTitle.textContent = 'Task Details';
                taskTitleInput.value = currentTaskData.title;

                // --- HOLIDAY PARSING FOR VIEW ---
                let viewText = currentTaskData.description || '';
                const startDateContainer = document.getElementById('start-date-container');
                const startDateInput = document.getElementById('task-start-input');
                const scheduleLabel = document.getElementById('schedule-label');

                // Detect if it's a Holiday task based on parsing? 
                // Or use `activeGroupType`? 
                // We don't have activeGroupType easy in 'view' unless we set it in click listener.
                // We set activeGroupIsIntro, but not `activeGroupType`.
                // Let's use the regex to define if we show start date fields.

                const startMatch = viewText.match(/^\[Start: (\d{4}-\d{2}-\d{2})\]\s*(.*)/s);
                if (startMatch) {
                    startDateContainer.classList.remove('hidden');
                    startDateInput.value = startMatch[1];
                    viewText = startMatch[2]; // Show only observation
                    scheduleLabel.textContent = 'Return Date:';
                } else {
                    startDateContainer.classList.add('hidden');
                    scheduleLabel.textContent = 'Scheduled Date & Time:';
                }

                taskTextInput.value = viewText;

                // --- VISIBILITY LOGIC ---
                // Always show description/text input
                taskTextInput.classList.remove('hidden');

                // --- EDITABILITY LOGIC ---
                const isDone = currentTaskData.status === 'done';

                if (isDone) {
                    // READ-ONLY MODE (Done tasks)
                    taskTitleInput.readOnly = true;
                    taskTextInput.readOnly = true;
                    saveTaskBtn.classList.add('hidden');

                    // Show Completion details
                    // ... (handled below)
                } else {
                    // EDIT MODE (Todo tasks)
                    // Allow editing title and description!
                    taskTitleInput.readOnly = false;
                    taskTextInput.readOnly = false;
                    saveTaskBtn.classList.remove('hidden');
                    saveTaskBtn.textContent = 'Save Changes'; // Distinct text
                }

                // Solution Field Logic
                const solutionInput = document.getElementById('task-solution-input');
                const solutionLabel = document.getElementById('solution-label');
                solutionInput.value = currentTaskData.solution || '';

                if (isDone) {
                    // If done, show solution as read-only
                    completeTaskBtn.classList.add('hidden');
                    solutionInput.readOnly = true;
                    solutionLabel.classList.remove('hidden');
                    solutionInput.classList.remove('hidden');
                } else {
                    // If todo, allow writing solution (for completion)
                    // The complete button handles the solution saving, so we hide it here?
                    // Actually, complete button is for MARKING as done.
                    // If we just want to edit text, we use Save Changes.
                    completeTaskBtn.classList.remove('hidden');

                    // Hide solution input in "Edit" mode unless we click complete?
                    // Original logic showed it for "completing". 
                    // Let's keep solution input hidden until we click complete? 
                    // Or keep it visible but writable? 
                    // Let's follow original: solution input was part of completion flow.
                    // But here we are just editing details.
                    // We can keep solution hidden in standard edit View.
                    solutionInput.readOnly = false;
                    solutionLabel.classList.remove('hidden');
                    solutionInput.classList.remove('hidden');
                }

                taskDates.classList.remove('hidden');
                if (currentTaskData.created_at) {
                    const createdDateStr = new Date(currentTaskData.created_at).toLocaleString('pt-BR');
                    let createdByStr = '';

                    if (currentTaskData.created_by && allUsersCache[currentTaskData.created_by]) {
                        createdByStr = ` by ${allUsersCache[currentTaskData.created_by]}`;
                    }

                    creationDateSpan.textContent = createdDateStr + createdByStr;
                }
                if (currentTaskData.completed_at) {
                    const completedDateStr = new Date(currentTaskData.completed_at).toLocaleString('pt-BR');
                    let completedByStr = '';

                    if (currentTaskData.completed_by && allUsersCache[currentTaskData.completed_by]) {
                        completedByStr = ` by ${allUsersCache[currentTaskData.completed_by]}`;
                    }

                    // NEW: Override if System Automated
                    if (currentTaskData.solution === 'Automatic Return') {
                        completedByStr = ' - System Automated';
                    }

                    completionDateSpan.textContent = completedDateStr + completedByStr;
                } else {
                    completionDateSpan.textContent = 'Pending...';
                }

                if (currentTaskData.priority) {
                    const radio = document.querySelector(`input[name="priority"][value="${currentTaskData.priority}"]`);
                    if (radio) radio.checked = true;
                }
                // Enable priority editing if not done
                document.querySelectorAll('input[name="priority"]').forEach(r => r.disabled = isDone);

                // --- DELETE BUTTON LOGIC ---
                const deleteBtn = document.getElementById('delete-task-btn');
                deleteBtn.classList.remove('hidden');

                // Handle Schedule Input View
                const scheduleContainer = document.getElementById('schedule-container');
                const scheduleInput = document.getElementById('task-schedule-input');
                if (currentTaskData.scheduled_at) {
                    scheduleContainer.classList.remove('hidden');
                    // Format for input: YYYY-MM-DDTHH:MM
                    const dt = safeDate(currentTaskData.scheduled_at);
                    if (dt && !isNaN(dt.getTime())) {
                        dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset()); // Local time adjustment
                        scheduleInput.value = dt.toISOString().slice(0, 16);
                    }

                    if (isDone) {
                        scheduleInput.readOnly = true;
                    } else {
                        scheduleInput.readOnly = false; // Allow rescheduling if needed
                    }
                } else {
                    scheduleContainer.classList.add('hidden');
                }
            }
        }

        function hideTaskModal() {
            taskModal.classList.add('hidden');
            activeGroupId = null;
            currentTaskData = null;
            document.querySelectorAll('input[name="priority"]').forEach(r => r.disabled = false);
        }

        closeTaskModalBtn.addEventListener('click', hideTaskModal);

        saveTaskBtn.addEventListener('click', async () => {
            try {
                const title = taskTitleInput.value.trim();
                const text = taskTextInput.value.trim();

                // Safe Priority Check
                const priorityEl = document.querySelector('input[name="priority"]:checked');
                const priority = priorityEl ? priorityEl.value : 'normal';

                // --- MODE CHECK: UPDATE vs CREATE ---
                if (currentTaskData && currentTaskData.id) {
                    // === UPDATE EXISTING TASK ===

                    // Validations
                    if (currentTaskData.scheduled_at && !document.getElementById('task-schedule-input').value) {
                        // If it HAD a schedule (Intro task), ensure it keeps one? 
                        // Or if we are in Intro group.
                        // Check activeGroupIsIntro or similar context if available, 
                        // or just rely on input presence if it was visible.
                        if (!document.getElementById('task-schedule-input').classList.contains('hidden') && !document.getElementById('task-schedule-input').value) {
                            showNotification('Date & Time cannot be empty.', 'error');
                            return;
                        }
                    }

                    // Prepare Update Data
                    const updateData = {
                        title: title,
                        description: text,
                        priority: priority
                    };

                    // HOLIDAY SAVING LOGIC (UPDATE)
                    const startDateContainer = document.getElementById('start-date-container');
                    if (!startDateContainer.classList.contains('hidden')) {
                        const sVal = document.getElementById('task-start-input').value;
                        if (sVal) {
                            updateData.description = `[Start: ${sVal}] ${text}`;
                        }
                    }

                    // Handle Schedule Update
                    const rawDate = document.getElementById('task-schedule-input').value;
                    if (rawDate && !document.getElementById('schedule-container').classList.contains('hidden')) {
                        updateData.scheduled_at = rawDate.replace('T', ' ') + ':00';
                    }

                    const success = await updateTaskAPI(currentTaskData.id, updateData);

                    if (success) {
                        await loadGroups();
                        hideTaskModal();
                        showNotification('Task updated successfully!', 'success');
                    } else {
                        showNotification('Failed to update task.', 'error');
                    }

                } else {
                    // === CREATE NEW TASK ===
                    if (title && activeGroupId) {
                        // --- Validation for Schedule Groups ---
                        const scheduleInput = document.getElementById('task-schedule-input');
                        if (activeGroupHasSchedule && !scheduleInput.value) {
                            showNotification('Please select a Date & Time.', 'error');
                            return;
                        }
                        // -----------------------------------------

                        // --- Duplicate Check ---
                        if (!activeGroupIsIntro) {
                            const groupCard = document.querySelector(`.task-card[data-group="${activeGroupId}"][data-type="todo"]`);
                            if (groupCard) {
                                const existingLis = groupCard.querySelectorAll('li');
                                let isDuplicate = false;
                                existingLis.forEach(li => {
                                    if (!li.dataset.id) return;
                                    const existingTitle = li.dataset.title || (li.querySelector('span:last-child') ? li.querySelector('span:last-child').innerText.split(' - ')[0].trim() : '');
                                    if (existingTitle && existingTitle.toLowerCase() === title.toLowerCase()) {
                                        isDuplicate = true;
                                    }
                                });

                                if (isDuplicate) {
                                    showNotification('Task with this name already exists in this group!', 'error');
                                    return; // Stop creation
                                }
                            }
                        }
                        // -----------------------

                        // Format Date for MySQL (YYYY-MM-DD HH:MM:SS)
                        let formattedScheduledAt = null;
                        const rawDate = document.getElementById('task-schedule-input').value;
                        if (rawDate) {
                            // If it's just a date (holiday return), append time? 
                            // Input is datetime-local, so it has time.
                            formattedScheduledAt = rawDate.replace('T', ' ') + ':00';
                        }

                        // HOLIDAY SAVING LOGIC (CREATE)
                        let finalDescription = text;
                        if (activeGroupType === 'holiday') {
                            const sVal = document.getElementById('task-start-input').value;
                            if (sVal) {
                                finalDescription = `[Start: ${sVal}] ${text}`;
                            }
                        }

                        const newTask = await createTaskAPI({
                            group_id: activeGroupId,
                            title: title,
                            description: finalDescription,
                            priority: priority,
                            status: 'todo',
                            scheduled_at: formattedScheduledAt
                        });

                        if (newTask) {
                            await loadGroups();
                            hideTaskModal();
                        } else {
                            showNotification('Failed to create task (API Error).', 'error');
                        }
                    }
                }
            } catch (err) {
                console.error(err);
                alert("Error saving task: " + err.message);
            }
        });

        completeTaskBtn.addEventListener('click', async () => {
            if (currentTaskData && currentTaskData.id) {
                // MySQL Friendly Date Format: YYYY-MM-DD HH:MM:SS
                const now = new Date();
                const mysqlDate = now.toISOString().slice(0, 19).replace('T', ' ');
                const solution = document.getElementById('task-solution-input').value.trim();

                const success = await updateTaskAPI(currentTaskData.id, {
                    status: 'done',
                    completed_at: mysqlDate,
                    solution: solution // Save solution text
                });

                if (success) {
                    hideTaskModal();
                    loadGroups(); // Refresh UI
                    showNotification('Task marked as done!', 'success');
                } else {
                    showNotification('Failed to update task status.', 'error');
                }
            }
        });


        // --- DELETE BUTTON LISTENER ---
        const deleteTaskBtn = document.getElementById('delete-task-btn');
        deleteTaskBtn.addEventListener('click', () => {
            if (currentTaskData && currentTaskData.id) {
                // Set pending ID for confirmation modal
                window.pendingDeleteTaskId = currentTaskData.id;
                // Stronger warning as requested
                const confirmModalText = document.querySelector('.modal-content p');
                confirmModalText.innerHTML = 'Are you sure you want to delete this task?<br><br><strong>WARNING: This action cannot be undone. The task will be permanently removed for EVERYONE.</strong>';
                customConfirmModal.classList.remove('hidden');
                hideTaskModal(); // Close the task detail modal
            }
        });

        filterInput.addEventListener('input', () => {
            const filterText = filterInput.value.toLowerCase().trim();
            const allCards = document.querySelectorAll('.task-card');

            allCards.forEach(card => {
                const cardTitle = card.querySelector('h3').textContent.toLowerCase();
                const groupMatches = cardTitle.includes(filterText);
                const listItems = Array.from(card.querySelectorAll('li'));
                let hasVisibleTasks = false;
                let currentHeader = null;
                let currentHeaderMatches = false;

                listItems.forEach(li => {
                    const isHeader = !li.dataset.id;

                    if (isHeader) {
                        currentHeader = li;
                        const headerText = li.innerText.toLowerCase();
                        // Check if the header itself matches the filter
                        currentHeaderMatches = headerText.includes(filterText);

                        // Show header if:
                        // 1. Filter is empty (show all)
                        // 2. Header matches (show this section)
                        // Note: Removed groupMatches to prevent "Introduction" or "To Do" matches from showing everything.
                        if (filterText === '' || currentHeaderMatches) {
                            li.style.display = '';
                        } else {
                            li.style.display = 'none';
                        }
                    } else {
                        // It's a task
                        const text = li.innerText.toLowerCase();
                        // Task matches if:
                        // 1. Filter is empty
                        // 2. The task text itself matches
                        // [FIX] Removed 'currentHeaderMatches' to prevent showing all tasks under a matching date header.
                        // Strict filtering is preferred by user.
                        const taskMatches = (filterText === '') || text.includes(filterText);

                        if (taskMatches) {
                            li.style.display = '';
                            hasVisibleTasks = true;
                            // If we have a header that is currently hidden (e.g. because we matched ONLY the task text),
                            // showing the task requires showing its header context.
                            if (currentHeader && currentHeader.style.display === 'none') {
                                currentHeader.style.display = '';
                            }
                        } else {
                            li.style.display = 'none';
                        }
                    }
                });

                // Display card if filter is empty OR if it has visible content
                if (filterText === '') {
                    card.style.display = '';
                } else {
                    card.style.display = hasVisibleTasks ? '' : 'none';
                }
            });
        });



        // --- INITIALIZATION ---
        (async () => {
            try {
                await setupFixedGroups();
                await loadUsers(); // Load users FIRST to populate cache
                await loadGroups(); // Then load groups
            } catch (e) {
                console.error(e);
                alert("Init Failed: " + e.message);
            }
        })();



    }

    // --- HELPERS ---
    function showNotification(message, type = 'success') {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `notification-toast ${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" class="notification-close-btn">&times;</button>
        `;

        container.appendChild(toast);

        // Auto remove after 3s (animation handles visual ease out)
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 3000);
    }

    // --- LOGIN LOGIC ---
    if (isLoginPage) {
        // Auto-Redirect if already logged in
        const existingToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        if (existingToken) {
            window.location.href = 'whiteboard.html';
        }

        const loginContainer = document.getElementById('login-container');
        const registerContainer = document.getElementById('register-container');
        const showRegisterLink = document.getElementById('show-register');
        const showLoginLink = document.getElementById('show-login');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');

        // --- Auto-Fill Email ---
        const savedEmail = localStorage.getItem('savedEmail');
        if (savedEmail) {
            document.getElementById('login-email').value = savedEmail;
            document.getElementById('remember-me').checked = true;
        }
        // -----------------------

        // Toggle Forms
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginContainer.classList.add('hidden');
            registerContainer.classList.remove('hidden');
        });
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            registerContainer.classList.add('hidden');
            loginContainer.classList.remove('hidden');
        });

        // Register Logic
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = registerForm.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = "Loading...";
            btn.disabled = true;

            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-confirm-password').value;

            if (password !== confirmPassword) {
                showNotification("Passwords do not match!", 'error');
                btn.innerText = originalText;
                btn.disabled = false;
                return;
            }

            try {
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });
                const data = await response.json();

                if (response.ok) {
                    showNotification('Registration successful! Please login.', 'success');
                    setTimeout(() => showLoginLink.click(), 1500);
                } else {
                    showNotification(data.error || 'Registration failed', 'error');
                }
            } catch (error) {
                console.error("Fetch error:", error);
                showNotification('Error connecting to server.', 'error');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });

        // Login Logic
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = "Loading...";
            btn.disabled = true;

            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const rememberMe = document.getElementById('remember-me').checked;

            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                // Handle HTTP Errors
                if (!response.ok) {
                    const data = await response.json().catch(() => ({})); // Handle cases where JSON parse fails

                    if (response.status === 401) {
                        showNotification('Invalid email or password.', 'error');
                    } else if (response.status >= 500) {
                        showNotification('Server error (Railway Limit/Outage). Please try again later.', 'error');
                    } else {
                        showNotification(data.error || `Login failed (${response.status})`, 'error');
                    }
                    return; // Stop execution
                }

                // Success
                const data = await response.json();
                showNotification('Login successful! Redirecting...', 'success');

                // --- Storage Logic ---
                if (rememberMe) {
                    // Persist session + email
                    localStorage.setItem('authToken', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.setItem('savedEmail', email); // Save email for next time
                } else {
                    // Session only + clear saved email
                    sessionStorage.setItem('authToken', data.token);
                    sessionStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.removeItem('savedEmail'); // Clear if they unchecked it
                }

                setTimeout(() => {
                    window.location.href = 'whiteboard.html';
                }, 1000);

            } catch (error) {
                console.error("Fetch error:", error);
                showNotification('Unable to connect to server. Check your internet or try again later.', 'error');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

});
