# Whiteboard Project 📝

**Live App:** [https://haroldcrossoffice.online/](https://haroldcrossoffice.online/)  
**GitHub Repository:** [https://github.com/daniloluzjr/whiteboard_herold_cross](https://github.com/daniloluzjr/whiteboard_herold_cross)  
**Backend API (Railway):** `https://web-production-0f66c.up.railway.app`

This is a real-time, collaborative whiteboard application designed for team task management. It separates "To Do" and "Done" tasks into intuitive card groups, providing a visual overview of team activity, now featuring a modern **Glassmorphism** UI.

## 🚀 Split Architecture
- **Frontend:** Hosted on [GitHub Pages](https://pages.github.com/) (Vercel redirect)
- **Backend & Database:** Hosted on [Railway](https://railway.app/)

## ✨ Features
- **Real-time Updates:** Stay synced with your team effortlessly.
- **Glassmorphism UI:** A sleek, modern aesthetic with frosted glass effects.
- **User Authentication:** Secure login for team members (iniscare.ie domains only).
- **Task Management:** Create, delete, and categorize tasks with ease.
- **Collaborative Whiteboard:** A shared space for brainstorming and planning.

## ⚙️ Development & Setup

### Local Setup
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Configure environment variables in a `.env` file (Database credentials, JWT secret).
4. Run the backend: `node server.js`.
5. Open `index.html` in your browser.

### Deployment
- **Frontend:** Pushes to `main` are automatically deployed to the connected frontend provider.
- **Backend:** Pushes to `main` are automatically picked up by Railway.

## 🛠️ Tech Stack
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6+).
- **Backend:** Node.js, Express.
- **Database:** MySQL (Managed via Railway).
- **Authentication:** JSON Web Tokens (JWT) & BcryptJS.

---
*Created with ❤️ by Danilo A. Da Luz Junior*
