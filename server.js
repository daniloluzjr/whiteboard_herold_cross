const express = require('express');
const path = require('path');
const cors = require('cors');
const mysql = require('mysql2/promise');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// CORS Configuration
// Allow all origins for now to support Vercel/Localhost easy testing.
// In production, you might want to restrict this to 'https://ourwhiteboard.vercel.app'
app.use(cors());

app.use(express.json());

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

// --- Middleware: Authenticate Token ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// --- Auth Routes ---

// POST /api/register
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // --- Domain Validation ---
    if (!email.endsWith('@iniscare.ie')) {
        return res.status(400).json({ error: 'Please sign up using your corporate email address.' });
    }
    // ------------------------

    try {
        // Check if user exists
        const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        // Insert user
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    try {
        // Find user
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = users[0];
        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Generate Token
        const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

        // Update last_login
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- User Status Routes ---

// GET /api/users - List all users (id, name, status)
app.get('/api/users', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, name, email, status, last_login FROM users');
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// PATCH /api/users/status - Update own status
app.patch('/api/users/status', authenticateToken, async (req, res) => {
    const { status } = req.body;
    try {
        await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, req.user.id]);
        res.json({ message: 'Status updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// PATCH /api/users/:id - Admin update user (name, email, etc.)
app.patch('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, status } = req.body;

    // Build dynamic query
    let fields = [];
    let values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

    try {
        await pool.query(query, values);
        res.json({ message: 'User updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// DELETE /api/users/:id - Delete a user (Admin/Cleanup tool)
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    // Optional: Prevent deleting self
    if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    try {
        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'User deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Database Connection Pool
// Database Connection Configuration
const dbConfig = {
    host: process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST,
    user: process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE,
    port: process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
};

// Use DATABASE_URL if available (Railway Standard), otherwise use individual params
const pool = mysql.createPool(process.env.DATABASE_URL || dbConfig);

// --- Setup / Migration Helper ---
async function runMigrations() {
    try {
        // Check if 'solution' column exists
        const [columns] = await pool.query("SHOW COLUMNS FROM tasks LIKE 'solution'");
        if (columns.length === 0) {
            console.log("Migration: Adding 'solution' column to tasks table...");
            await pool.query("ALTER TABLE tasks ADD COLUMN solution TEXT");
            console.log("Migration: 'solution' column added.");
        }

        // Check if 'created_by' column exists
        const [columnsCreatedBy] = await pool.query("SHOW COLUMNS FROM tasks LIKE 'created_by'");
        if (columnsCreatedBy.length === 0) {
            console.log("Migration: Adding 'created_by' column to tasks table...");
            await pool.query("ALTER TABLE tasks ADD COLUMN created_by INT");
            console.log("Migration: 'created_by' column added.");
        }

        // Check if 'scheduled_at' column exists (Introduction Feature)
        const [columnsScheduled] = await pool.query("SHOW COLUMNS FROM tasks LIKE 'scheduled_at'");
        if (columnsScheduled.length === 0) {
            console.log("Migration: Adding 'scheduled_at' column to tasks table...");
            await pool.query("ALTER TABLE tasks ADD COLUMN scheduled_at DATETIME NULL");
            console.log("Migration: 'scheduled_at' column added.");
        }

        // Check if 'completed_by' column exists (Task Completion User)
        // Note: created_by already exists and was added earlier, but let's ensure completed_by is there too if distinct
        const [columnsCompletedBy] = await pool.query("SHOW COLUMNS FROM tasks LIKE 'completed_by'");
        if (columnsCompletedBy.length === 0) {
            console.log("Migration: Adding 'completed_by' column to tasks table...");
            await pool.query("ALTER TABLE tasks ADD COLUMN completed_by INT");
            console.log("Migration: 'completed_by' column added.");
        }

        // Check if 'activity_logs' table exists (Admin Log Reg)
        const [tablesLogs] = await pool.query("SHOW TABLES LIKE 'activity_logs'");
        if (tablesLogs.length === 0) {
            console.log("Migration: Creating 'activity_logs' table...");
            await pool.query(`
                CREATE TABLE activity_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT,
                    user_name VARCHAR(255),
                    action VARCHAR(50),
                    task_title VARCHAR(255),
                    group_name VARCHAR(255),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log("Migration: 'activity_logs' table created.");
        }

        // Check if 'last_login' column exists
        const [columnsLastLogin] = await pool.query("SHOW COLUMNS FROM users LIKE 'last_login'");
        if (columnsLastLogin.length === 0) {
            console.log("Migration: Adding 'last_login' column to users table...");
            await pool.query("ALTER TABLE users ADD COLUMN last_login DATETIME NULL");
            console.log("Migration: 'last_login' column added.");
        }

    } catch (err) {
        console.error("Migration warning:", err.message);
    }
}
runMigrations();

// --- Log Helper ---
async function logActivity(userId, userName, action, taskTitle, groupName) {
    try {
        await pool.query(
            'INSERT INTO activity_logs (user_id, user_name, action, task_title, group_name) VALUES (?, ?, ?, ?, ?)',
            [userId, userName, action, taskTitle, groupName]
        );
    } catch (err) {
        console.error("Failed to log activity:", err); // Non-blocking error
    }
}

// --- Group Routes ---

// GET /api/groups - List all groups with their tasks
app.get('/api/groups', async (req, res) => {
    try {
        // Fetch groups
        const [groups] = await pool.query('SELECT * FROM task_groups');
        // Fetch tasks
        const [tasks] = await pool.query('SELECT * FROM tasks');

        // Nest tasks under groups
        const groupsWithTasks = groups.map(group => ({
            ...group,
            tasks: tasks.filter(task => task.group_id === group.id)
        }));

        res.json(groupsWithTasks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// POST /api/groups - Create a new group
app.post('/api/groups', authenticateToken, async (req, res) => {
    const { name, color } = req.body;
    try {
        const [result] = await pool.query('INSERT INTO task_groups (name, color) VALUES (?, ?)', [name, color]);
        res.status(201).json({ id: result.insertId, name, color, tasks: [] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// DELETE /api/groups/:id - Delete a group and its tasks
app.delete('/api/groups/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM tasks WHERE group_id = ?', [id]);
        await pool.query('DELETE FROM task_groups WHERE id = ?', [id]);
        res.json({ message: 'Group deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete group' });
    }
});

// PATCH /api/groups/:id - Rename a group
app.patch('/api/groups/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        await pool.query('UPDATE task_groups SET name = ? WHERE id = ?', [name, id]);
        res.json({ message: 'Group updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update group' });
    }
});

// POST /api/tasks - Create a new task (Authenticated)
app.post('/api/tasks', authenticateToken, async (req, res) => {
    // User is guaranteed to be in req.user by middleware
    const created_by = req.user.id;
    const user_name = req.user.name || 'Unknown';

    const { group_id, title, description, priority, status, scheduled_at } = req.body;
    try {
        // Handle scheduled_at being optional
        const scheduledDate = scheduled_at ? scheduled_at : null;

        const [result] = await pool.query(
            'INSERT INTO tasks (group_id, title, description, priority, status, created_by, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [group_id, title, description, priority, status || 'todo', created_by, scheduledDate]
        );
        const newTask = {
            id: result.insertId,
            group_id,
            title,
            description,
            priority,
            status: status || 'todo',
            created_by: created_by,
            scheduled_at: scheduledDate,
            created_at: new Date()
        };

        // --- Logging ---
        // Fetch group name for the log
        const [groups] = await pool.query('SELECT name FROM task_groups WHERE id = ?', [group_id]);
        const group_name = groups.length > 0 ? groups[0].name : 'Unknown Group';

        logActivity(created_by, user_name, 'CREATED', title, group_name);
        // ---------------

        res.status(201).json(newTask);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create task' });
    }
});


// PATCH /api/tasks/:id - Update task (status, completion_at, etc.)
app.patch('/api/tasks/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status, completed_at, title, description, priority, group_id, scheduled_at } = req.body;

    // Construct dynamic query
    let fields = [];
    let values = [];

    if (status !== undefined) {
        fields.push('status = ?');
        values.push(status);

        // Logic for completed_by
        if (status === 'done') {
            fields.push('completed_by = ?');
            values.push(req.user.id);
        } else if (status === 'todo') {
            // Reset if moving back to todo
            fields.push('completed_by = NULL');
        }
    }
    if (completed_at !== undefined) { fields.push('completed_at = ?'); values.push(completed_at); }
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (priority !== undefined) { fields.push('priority = ?'); values.push(priority); }
    if (group_id !== undefined) { fields.push('group_id = ?'); values.push(group_id); }
    if (scheduled_at !== undefined) { fields.push('scheduled_at = ?'); values.push(scheduled_at); }
    // Add solution support
    const { solution } = req.body;
    if (solution !== undefined) { fields.push('solution = ?'); values.push(solution); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);
    const query = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`;

    try {
        await pool.query(query, values);

        // --- Logging Check ---
        if (status === 'done') {
            // Fetch task details for logging (we need title and group)
            // We use a JOIN to get the Group Name in one go
            const [taskDetails] = await pool.query(`
                SELECT t.title, g.name as group_name 
                FROM tasks t 
                LEFT JOIN task_groups g ON t.group_id = g.id 
                WHERE t.id = ?
            `, [id]);

            if (taskDetails.length > 0) {
                const { title, group_name } = taskDetails[0];
                logActivity(req.user.id, req.user.name || 'Unknown', 'COMPLETED', title, group_name || 'Unknown Group');
            }
        }
        // ---------------------

        res.json({ message: 'Task updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// DELETE /api/tasks/:id - Delete a task
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM tasks WHERE id = ?', [id]);
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// --- Logs Route ---
// GET /api/logs - Fetch activity logs
app.get('/api/logs', async (req, res) => {
    try {
        // Order by created_at DESC (Newest first)
        const [logs] = await pool.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 200');
        res.json(logs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
