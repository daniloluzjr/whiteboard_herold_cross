# Whiteboard Project 📝

**Live App:** [https://glasnevinoffice.online/](https://glasnevinoffice.online/)  
**GitHub Repository:** [https://github.com/daniloluzjr/whiteboard](https://github.com/daniloluzjr/whiteboard)  
**Backend API (Railway):** `https://web-production-b230e.up.railway.app`

This is a real-time, collaborative whiteboard application designed for team task management. It separates "To Do" and "Done" tasks into intuitive card groups, providing a visual overview of team activity, now featuring a modern **Glassmorphism** UI.

---

## 🚀 Deployment (Split Architecture)

This project uses a **Split Architecture** logic, meaning the visual part (Frontend) and the brain (Backend/Database) are hosted in different places.

### Overview
1.  **Frontend (Site):** Hosted on **GitHub Pages**.
    *   **URL:** `https://glasnevinoffice.online/`
    *   **Function:** Displays the whiteboard and login page.
2.  **Backend (API + Database):** Hosted on **Railway**.
    *   **URL:** `https://web-production-b230e.up.railway.app`
    *   **Function:** Processes login, saves tasks, and manages the database.

### 1. Frontend (Static)
- **Host:** GitHub Pages
- **Reason:** Fastest updating, no cold starts, purely static HTML/JS/CSS.
- **Files:** `index.html` (Redirects to whiteboard), `whiteboard.html`, `login.html`, `admin.html`, `app.js`, `app.css`.
- **Logic:** `app.js` makes `fetch()` calls to the backend API.

### 2. Backend (API)
- **Host:** Railway (App Service)
- **Runtime:** Node.js (Express)
- **Address:** `https://web-production-b230e.up.railway.app`
- **Logic:** `server.js` handles all business logic, authentication (JWT), and database queries.
- **Auto-Sleep:** Note that free tiers may spin down. First request might take 3-5 seconds.

### 3. Database
- **Host:** Railway (MySQL Service)
- **Type:** MySQL 8.0
- **Structure:**
    - `users`: Stores emails, hashed passwords (`bcrypt`), and current status.
    - `task_groups`: Defines the columns/cards (e.g., Coordinators, Supervisors).
    - `tasks`: Individual items linked to groups and creators.

---

## ✨ Key Features

### User System
*   **Authentication:** Secure Login/Register with JWT tokens.
*   **Auto-Logout:** Robust session handling checks on page load and every minute. Enforces daily login refresh at 08:30 AM to ensure accurate daily tracking.
*   **Domain Lock:** Registration restricted to `@inicare.ie` emails.
*   **Real-Time Status:** Users can set their status (Available ⚡, Busy ⛔, Lunch 🍽️, etc.) visible to all colleagues in the sidebar.

### Task Management
*   **Auto-Refresh:** The board automatically updates every 5 seconds to ensure all users see the latest changes without manual refreshing.
*   **Smart Groups:**
    *   **Fixed Groups:** "Admitted to Hospital", "Returned from Hospital", "Supervisors", and "Sheets Needed" (Permanent).
    *   **Introduction Group:** Specialized group with "Carer Name" fields and chronological scheduling.
*   **Task Lifecycle:** Create -> To Do -> Done -> Delete.
*   **Safeguards:** Red "Permanent Action" warning modal appears before deletion.
*   **Admin Dashboard:** (`/admin.html`) to view/manage all data.

### 🎨 UI/UX Design (New!)
*   **Glassmorphism:** Global application of transparency (`rgba`) and blur filters (`backdrop-filter`) for a premium, modern feel.
*   **Smart Transparency:** Group cards use tinted transparent backgrounds (e.g., Blue Tint for Coordinators) to maintain the glass effect without losing color coding.
*   **Standardized Headers:** Date headers (e.g., "Monday 23/12") use a consistent, high-contrast semi-transparent white style across all groups for readability.
*   **Refined Shadows & Borders:** Subtle shadows and cleaner borders for a less cluttered interface.
*   **Mobile Responsiveness:** Sidebar scrolling enabled for small screens to ensure all menu items and the Logout button are always accessible. Optimized for mobile with a compact menu width (65%), smaller fonts, and scaled-down interactive elements (buttons/inputs) for a delicate, native-app feel.

---

## 🛠️ Development Guide

### Prerequisites
*   Node.js (v18+)
*   Git

### Setup (Localhost)

1.  **Clone the Repo:**
    ```bash
    git clone https://github.com/daniloluzjr/whiteboard.git
    cd whiteboard
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Run Backend:**
    ```bash
    node server.js
    ```

4.  **Run Frontend:**
    ```bash
    npx serve .
    ```

### 🔐 Environment Variables (Backend)
These are configured in the Railway dashboard. Do not commit `.env` files containing real passwords.

```env
PORT=3000
DB_HOST=railway-tcp-proxy...
DB_USER=root
DB_PASSWORD=...
DB_NAME=railway
JWT_SECRET=...
```

---

## 🔄 Updates & Deployment

### To Update Frontend:
1.  Edit `app.js`, `app.css`, or `.html` files.
2.  Commit and Push to GitHub.
3.  GitHub Pages updates automatically (wait ~1-2 mins).
    *   *Tip: Cache can be sticky. Use `Ctrl+F5` to force refresh.*

### To Update Backend:
1.  Edit `server.js`.
2.  Commit and Push.
3.  Railway detects the commit and redeploys the server automatically.

---

## 🚑 Troubleshooting

*   **White Screen / Loading Forever:**
    *   Check the browser console (F12).
    *   API might be sleeping. Wait 10s and refresh.
*   **"Session Expired" / Redirect to Login:**
    *   This is normal behavior if your token expires (approx 24h). Just log in again.
*   **Changes not appearing:**
    *   Clear browser cache or check if you are editing the correct file (local vs live).
