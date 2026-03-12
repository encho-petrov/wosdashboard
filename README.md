# WoS Dashboard

![Status](https://img.shields.io/badge/status-active-success)
![Backend](https://img.shields.io/badge/backend-Go-00ADD8)
![Frontend](https://img.shields.io/badge/frontend-React-61DAFB)
![Database](https://img.shields.io/badge/database-MySQL-orange)
![Deployment](https://img.shields.io/badge/deployment-Docker-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A lightweight **state management dashboard for Whiteout Survival (WoS)**.

WoS Dashboard provides R4/R5 leadership with a centralized interface to manage **players, alliances, events, transfers, and reservations** — replacing scattered spreadsheets, Google Docs, and manual Discord coordination.

Originally built as a **gift code redeemer**, the project evolved into a **full operational dashboard** tailored for real WoS leadership workflows.

---

# Screenshots

*(Coming soon)*

---

# Live Demo

A walkthrough of the dashboard will be available here:

📺 **YouTube Demo**  
*(link coming soon)*

---

# Why This Exists

Running a WoS state often requires juggling:

- multiple Google Sheets
- Discord reminders
- fortress rotation spreadsheets
- manual ministry reservation tracking
- event coordination chaos during SvS and Tyrant

WoS Dashboard consolidates everything into **one lightweight management platform** designed specifically for **state leadership teams**.

Goal:

> Give state leadership a single place to run the entire state.

---

# Features

## Player & Alliance Management

- Complete **state roster management**
- Add, edit, and remove players and alliances
- Sync player data from the **WoS API**
    - avatar
    - nickname
    - furnace level
- Advanced filtering and sorting
- Track player availability for events
- Configure **standard and fighting alliances**

---

## Event Planning

Tools designed for coordinating large-scale events such as **SvS**.

- Fighting alliance deployment
- Rally team organization
- Troop formations
- Pet schedules
- Event history tracking

---

## Ministry Reservation System

A streamlined system for **SvS ministry reservations**.

- Custom reservation schedules
- Predefined templates
- Reservation history tracking

---

## Fortress & Stronghold Allocation

Plan seasonal fortress rotations.

- Full season schedule
- Alliance allocation management
- Visual reward representation

---

## Transfer Manager

Manage incoming and outgoing player transfers.

- WoS API integration
- Track invitation counts
- Predefined seasonal settings
- "Transfer Out" option from the roster page
- Complete transfer history

---

## Foundry & Canyon Clash Management

Alliance-based event coordination.

- Legion assignment interface
- Player bench based on alliance roster
- Attendance history visibility
- Full event history

---

## Discord Integration

Integrated reminder system with Discord.

Supports reminders for:

- Fortress allocations
- Fighting alliance assignments
- Rally teams
- Pet schedules
- Troop ratios
- Ministry reservations
- Foundry & Canyon Clash assignments

Features include:

- Separate **state and alliance Discord configurations**
- Role tagging support
- Fully customizable reminder messages

---

## Gift Code Redemption

Redeem gift codes directly from the dashboard.

- Live redemption tracking
- CSV reporting

⚠ Requires an **external captcha solving service**.

---

## Role-Based Access Control

Flexible permission system for leadership teams.

### Moderator
- Limited permissions
- Can manage their own alliance roster

### Admin
- Full system access

Security features:

- Two-step alliance access approval
- Multi-factor authentication
    - TOTP
    - biometric authentication support

---

## Player Dashboard

Players can log in using their **game ID** to view:

- Fighting alliance assignments
- Rally team assignments
- Upcoming ministry reservations
- Fortress and Stronghold allocations

---

## Audit Logs

All administrative actions are logged.

- Track changes
- Maintain accountability
- Simplify debugging

---

## Automatic Database Backups

Encrypted backups supported via:

- AWS
- Google Cloud
- Cloudflare R2

Features:

- Scheduled backups
- GPG encryption
- Full restore capability

---

# Tech Stack

| Component | Technology |
|---|---|
| Backend | Go |
| Frontend | React + Vite |
| Reverse Proxy | OpenResty / Nginx |
| Database | MySQL |
| Cache | Redis |
| Deployment | Docker |
| Captcha Service | 2captcha |

---

# Architecture

*(Diagram will be added later)*

Typical deployment structure:

```
React UI
   │
   ▼
OpenResty / Nginx
   │
   ▼
Go API
   │
   ├── MySQL
   └── Redis
```

---

# Repository Structure

```
/cmd/server
    Go backend 
    
/cmd/scraper
    Go assets scraper

/internal
    Go backend packages

/dashboard
    React frontend
    
/migrations
    MySQL automatic migration history

/shared-assets
    fonts and images

/ops
    MySQL automatic backup scripts

/appsettings.json
    main backend configuration

/docker-compose.yml
    full stack deployment
```

---

# Installation

The project can be deployed with **Docker Compose**.

## 1. Configure Backend

```bash
mv appsettings-example.json appsettings.json
vim appsettings.json
```

Configure:

- MySQL credentials
- JWT secret
- 2captcha API key
- WoS state ID
- Discord bot token
- Fortress rotation settings
- Dashboard name and domain
- Access/refresh token lifetimes

⚠ Remove comments from the configuration file before starting the application.

---

## 2. Configure Frontend API URL

```
vim dashboard/src/api/client.js
```

Default:

```
http://localhost:8080/api
```

---

## 3. Configure Environment Variables

```
mv .env.example .env
vim .env
```

Set:

- MySQL credentials
- S3-compatible backup credentials
- GPG key email identifier

---

## 4. Start Services

```
docker compose up -d
```

---

## 5. Download Assets

Run once after first startup:

```
docker exec scraper ./scraper
```

---

# Production Deployment

The included **nginx configuration is for testing only**.

For production:

- configure a domain
- enable HTTPS
- reconfigure nginx to act as reverse proxy

Recommended services:

Dynamic DNS  
https://www.noip.com

Free SSL certificates  
https://letsencrypt.org

---

# Roadmap

Possible future improvements:

- function modularity
- build and integration tests

---

# Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

# Support

If you find this project useful:

- Donate via [PayPal](https://www.paypal.com/donate/?business=J56LZPAC5G5YA&no_recurring=0&currency_code=EUR)
- Or send me some [frost stars - 57030176](https://store.centurygames.com/wos)

---

# License

This project is licensed under the **MIT License**.

You are free to:

- use
- modify
- distribute
- run privately

as long as the original license is included.