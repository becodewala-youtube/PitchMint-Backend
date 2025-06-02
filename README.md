
# 🚀 Startup Spark — AI-Powered Startup Idea Validator & Pitch Deck Generator (SaaS)

**Validate, Visualize, Venture.**  
Startup Spark is an AI-powered SaaS platform that empowers entrepreneurs to validate their startup ideas and generate investor-ready pitch decks using Google's Gemini API.

---

## 🧩 Features

- ✅ **Startup Idea Validator** – Evaluate startup ideas with AI-driven feedback.
- 📊 **Pitch Deck Generator** – Create customizable 10-slide pitch decks.
- 🧠 **Lean Canvas Editor** – Drag-and-drop editable business model canvas.
- 🔐 **User Authentication** – Email/password-based secure login.
- 💳 **Subscription Plans** – Free and Pro plans with Stripe integration.
- 🌙 **Dark/Light Mode** – Context API-based theme toggling with persistence.
- 📁 **Saved Dashboards** – Personalized dashboards to access saved ideas, decks, and canvases.

---

## 🖥️ Frontend Tech Stack

- **React.js** (Vite or Create React App)
- **Tailwind CSS** – Responsive design with dark mode support
- **React Router DOM** – Routing
- **Redux Toolkit** – Auth, subscription, idea & deck state
- **Axios** – API calls
- **Context API** – Theme toggling and persistence
- **Framer Motion** – Animations
- **Stripe Elements** – Checkout modal

---

## 📄 Pages

| Page | Description |
|------|-------------|
| Landing Page | Hero, tagline, pricing, CTAs |
| Signup/Login | Email/password auth |
| Dashboard | Personalized idea & deck overview |
| Idea Validator | AI form to submit and analyze startup ideas |
| Validation Results | Feedback from Gemini API |
| Pitch Deck Generator | Auto-generate editable pitch decks |
| My Pitch Decks | View, edit, download decks |
| Business Canvas | Lean Canvas editor |
| Pricing Page | Compare Free vs Pro plans, Stripe checkout |
| Profile/Settings | Update profile & subscription info |

---

## 🔌 API Endpoints (Frontend → Backend)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/user/dashboard` | Fetch dashboard data |
| POST | `/api/idea/validate` | Validate startup idea |
| GET | `/api/idea/:id` | Get validation result |
| POST | `/api/pitchdeck/generate` | Generate pitch deck |
| GET | `/api/pitchdeck/user` | Get user's decks |
| PATCH | `/api/pitchdeck/:id` | Edit pitch deck |
| POST | `/api/canvas/save` | Save business canvas |
| GET | `/api/canvas/user` | Get user's canvas data |
| POST | `/api/stripe/create-checkout` | Stripe checkout |
| GET | `/api/stripe/subscription` | Subscription details |

---

## 🧠 Backend Tech Stack

- **Node.js + Express.js**
- **MongoDB + Mongoose**
- **Google Gemini API** – AI content generation
- **Stripe** – Payment and subscription handling
- **JWT** – User authentication
- **Bcrypt.js** – Password encryption
- **dotenv** – Environment variables
- **Cookie-Parser** – Secure token management

---

## 🗃️ Mongoose Models

### User
```js
{
  name,
  email,
  password,
  role,
  plan,
  ideas: [],
  decks: [],
  canvas: []
}
````

### StartupIdea

```js
{
  userId,
  ideaText,
  industry,
  validationResult
}
```

### PitchDeck

```js
{
  userId,
  ideaId,
  slides: [{ title, content }],
  editable
}
```

### BusinessCanvas

```js
{
  userId,
  title,
  sections: [{ name, content }]
}
```

### Subscription

```js
{
  userId,
  stripeCustomerId,
  planType,
  status,
  createdAt
}
```

---

## 🏗️ Project Structure (Backend)

```
/backend
├── config/           # DB and Stripe setup
├── controllers/      # Route logic
├── middleware/       # Auth middleware
├── models/           # Mongoose schemas
├── routes/           # API endpoints
├── utils/            # Gemini prompts, PDF tools
└── server.js         # Entry point
```

---

## ⚙️ Requirements

### Software:

* Node.js (v18+)
* MongoDB Atlas or local DB
* VS Code or any IDE
* Internet connection

### APIs:

* Google Gemini API
* Stripe API

### Dev Tools:

* Postman (API testing)
* Tailwind CSS IntelliSense
* ESLint + Prettier

---

## 🧭 System Architecture

* **Frontend (React + Tailwind)** → Axios → **Backend (Node.js + Express)**
* Backend connects to:

  * **MongoDB (Mongoose)** for persistence
  * **Gemini API** for idea validation
  * **Stripe API** for payments

---

## 🔄 Workflow

1. **User Registers/Login**
2. **Dashboard** loads saved ideas/decks
3. **Idea Submitted** → Gemini API validates idea
4. **Results Displayed** → User reviews feedback
5. **Pitch Deck Generated** → Editable slide format
6. **Lean Canvas Editor** used for planning
7. **Stripe Checkout** for Pro users
8. **Decks/Canvas Saved** to DB and shown in dashboard

---

## 🔮 Future Enhancements

* 👥 Team collaboration & co-founder access
* 🌐 Multi-language support
* 📱 Mobile app (React Native)
* 📈 AI business plans & success forecasts
* 🎨 GPT-4 Vision for pitch deck visuals
* 📊 Analytics dashboard for idea trends

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🙌 Acknowledgements

* [Google Gemini API](https://ai.google.dev)
* [Stripe](https://stripe.com)
* [Tailwind CSS](https://tailwindcss.com)
* [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)


