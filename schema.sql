-- Create the database if it doesn't exist (useful for local dev)
-- CREATE DATABASE IF NOT EXISTS todoweb_db;
-- USE todoweb_db;

-- Table for Task Groups (Stickers)
CREATE TABLE IF NOT EXISTS task_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50) DEFAULT 'purple',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(50) DEFAULT 'white',
    status ENUM('todo', 'done') DEFAULT 'todo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE
);
