

# 🚀 PitchMint — AI-Powered Startup Idea Validator & Pitch Deck Generator (Backend API)

* *Validate, Visualize, Venture.**

This repository contains the robust backend API for PitchMint, an AI-powered SaaS platform that empowers entrepreneurs to validate startup ideas, generate investor-ready pitch decks, simulate investor Q&A, and analyze competitors using Google's Gemini API. Built with Node.js, Express, and MongoDB, it provides the core logic and data persistence for the PitchMint ecosystem.



## 📖 Table of Contents

*   [Key Features](#-key-features)

*   [Architecture Overview](#-architecture-overview)

*   [Tech Stack](#-tech-stack)

*   [Getting Started](#-getting-started)

    *   [Prerequisites](#prerequisites)

    *   [Installation](#installation)

*   [Configuration](#-configuration)

*   [Usage](#-usage)

*   [Scripts](#-scripts)

*   [Testing](#-testing)

*   [Acknowledgements](#-acknowledgements)



## 🧩 Key Features

*   **AI-Powered Core**: Integrates with Google Gemini API for:

    *   Startup idea validation and feedback.

    *   Automated pitch deck generation.

    *   Competitor analysis (SWOT).

    *   Investor Q&A simulation.

    *   Business model canvas generation.

*   **Secure User Authentication**: JWT-based authentication with email verification, password reset, and Google OAuth support.

*   **Credit Management**: System for purchasing and deducting credits for AI service usage, integrated with Razorpay.

*   **Data Persistence**: Stores user data, ideas, pitch decks, canvases, and activity history using MongoDB.

*   **Media Uploads**: Cloudinary integration for handling image uploads (e.g., user avatars, pitch deck assets).

*   **Email Services**: Nodemailer for sending verification, welcome, and password reset emails.

*   **Robust API**: RESTful API design with rate limiting, input sanitization, and comprehensive error logging.

*   **CORS Management**: Configurable CORS for secure communication with the frontend.

- --

## 🏗️ Architecture Overview

The PitchMint backend is built on the MERN (MongoDB, Express.js, React, Node.js) stack, specifically focusing on the Node.js and Express.js components. It functions as a RESTful API server, handling all business logic, data storage, and external integrations. MongoDB serves as the primary database for persistent storage of user accounts, startup ideas, generated pitch decks, and other application data.

Key integrations include Google's Gemini API for all AI-powered functionalities, Razorpay for processing credit purchases, and Cloudinary for managing media uploads. The backend is designed to be stateless, allowing for scalability, and communicates with the frontend via secure HTTP requests. Middleware is extensively used for authentication, authorization, rate limiting, and input sanitization to ensure a secure and reliable service.

- --

## 💻 Tech Stack

| Area | Tool | Version |
|---|---|---|
|---|---|---|
| Runtime | Node.js | >=18.0.0 |
| Framework | Express.js | ^4.18.3 |
|---|---|---|
| Database | MongoDB | (via Mongoose) |
| ODM | Mongoose | ^8.2.2 |
|---|---|---|
| AI Integration | Google Gemini API | ^0.2.1 |
| Payment Gateway | Razorpay | ^2.9.6 |
|---|---|---|
| Authentication | JWT | ^9.0.2 |
| Password Hashing | Bcrypt.js | ^2.4.3 |
|---|---|---|
| Environment Variables | dotenv | ^16.4.5 |
| CORS | cors | ^2.8.5 |
|---|---|---|
| Logging | Winston, Morgan | ^3.12.0, ^1.10.0 |
| Input Validation | Express-Validator | ^7.0.1 |
|---|---|---|
| Rate Limiting | Express-Rate-Limit | ^7.1.5 |
| File Uploads | Multer, Multer-Storage-Cloudinary | ^1.4.5-lts.1, ^4.0.0 |
|---|---|---|
| Email Service | Nodemailer | ^6.9.8 |
| Security | XSS-Clean | ^0.1.4 |
|---|---|---|
| Google OAuth | Google-Auth-Library | ^9.6.3 |



- --

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Before you begin, ensure you have the following installed:

*   [Node.js](https://nodejs.org/en/) (LTS version, >=18.0.0 recommended)

*   [MongoDB](https://www.mongodb.com/try/download/community) (local or cloud instance like MongoDB Atlas)

*   [Git](https://git-scm.com/)

### Installation

1.  **Clone the repository:**

```bash
git clone https://github.com/becodewala-youtube/PitchMint-Backend.git

cd PitchMint-Backend

```
2.  **Install dependencies:**

```bash
npm install

# or
pnpm install

# or
    yarn install

```
3.  **Create a `.env` file:**
    Copy the `.env.example` (if available, otherwise create it) and populate it with your environment variables. See the [Configuration](#-configuration) section for required variables.

```bash
touch .env

```
4.  **Connect to MongoDB:**
    Ensure your `MONGODB_URI` in the `.env` file is correctly configured and your MongoDB instance is running.

- --

## ⚙️ Configuration

The application uses environment variables for sensitive information and configuration settings. Create a `.env` file in the root directory and populate it with the following:

| ENV | Description | Example |
|---|---|---|
|---|---|---|
| `PORT` | Port for the Express server to listen on | `5000` |
| `NODE_ENV` | Application environment (`development`, `production`) | `development` |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/pitchmint?retryWrites=true&w=majority` |
| `JWT_SECRET` | Secret key for signing JWTs | `your_jwt_secret_key` |
|---|---|---|
| `JWT_EXPIRES_IN` | JWT expiration time | `30d` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `your_google_client_id` |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key | `your_gemini_api_key` |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID | `rzp_test_xxxxxxxxxxxxxx` |
|---|---|---|
| `RAZORPAY_KEY_SECRET` | Razorpay API Key Secret | `your_razorpay_secret` |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for verifying Razorpay webhooks | `your_razorpay_webhook_secret` |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | `your_cloudinary_cloud_name` |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | `your_cloudinary_api_key` |
|---|---|---|
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | `your_cloudinary_api_secret` |
| `EMAIL_HOST` | SMTP host for sending emails | `smtp.gmail.com` |
|---|---|---|
| `EMAIL_PORT` | SMTP port | `587` |
| `EMAIL_USER` | Email address for sending emails | `your_email@example.com` |
|---|---|---|
| `EMAIL_PASS` | Password/App-specific password for the email | `your_email_password` |
| `FRONTEND_URL` | URL of the PitchMint frontend application (for CORS and email links) | `http://localhost:5173` or `https://pitch-mint-frontend.vercel.app` |



- --

## 💡 Usage

To start the development server:

```bash
npm run dev

```
The server will typically run on `http://localhost:5000` (or the port specified in your `.env`).

To start the server in production mode:

```bash
npm start

```
You can interact with the API using tools like Postman, Insomnia, or `curl`.

* *Example: Registering a new user**

```bash
curl -X POST \

http://localhost:5000/api/auth/register \

  - H 'Content-Type: application/json' \

- d '{

"name": "John Doe",
"email": "john.doe@example.com",

"password": "securepassword123"
  }'

```
* *Example: Logging in a user**

```bash
curl -X POST \

http://localhost:5000/api/auth/login \

  - H 'Content-Type: application/json' \

- d '{

"email": "john.doe@example.com",
"password": "securepassword123"

}'

```


## 🧠 Scripts

Commonly used npm scripts are defined in the `package.json` file:

| Command          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `npm run dev`    | Start the development server using Nodemon     |
| `npm start`      | Start the production server                    |
| `npm test`       | Run test suites (Jest/Mocha)                   |


Example:

```bash
npm run dev
```



## 🧪 Testing

PitchMint uses **Jest** (or **Mocha + Chai**) for backend testing.

### Running Tests

```bash
npm test
```








## 🌟 Acknowledgements

Special thanks to all the tools and services that make PitchMint possible:

* **Google Gemini API** — for powering all AI-driven functionalities
* **Razorpay** — for seamless payment and credit management
* **MongoDB Atlas** — for reliable cloud database storage
* **Cloudinary** — for fast and secure media management
* **Nodemailer** — for robust email communication
* **Express.js** — for building a scalable REST API

