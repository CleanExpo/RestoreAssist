# RestoreAssist

AI-powered disaster restoration damage assessment platform for Australian properties.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-blue)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)

Generate professional damage assessment reports with AI-powered analysis, compliant with Australian building standards (NCC 2022).

---

## ✨ Features

### 🤖 AI-Powered Reports
- **Claude Opus 4** integration for intelligent damage assessment
- Professional summaries and detailed scope of work
- Itemized cost estimates in AUD
- Australian building standards compliance (NCC 2022)
- State-specific regulations (NSW, VIC, QLD, WA, SA, TAS, ACT, NT)

### 🏗️ Damage Types Supported
- 💧 Water Damage
- 🔥 Fire Damage
- 🌪️ Storm Damage
- 🌊 Flood Damage
- 🦠 Mold Damage

### 📊 Complete Platform
- Client-side or server-side AI processing
- Real-time report generation (10-15 seconds)
- Report storage with pagination
- Statistics and analytics
- Export capabilities (ready for DOCX/PDF)
- Admin monitoring dashboard

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- npm or yarn
- Anthropic API key ([Get one here](https://console.anthropic.com))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/CleanExpo/RestoreAssist.git
cd RestoreAssist

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp packages/backend/.env.example packages/backend/.env.local

# 4. Add your Anthropic API key
# Edit packages/backend/.env.local and add:
# ANTHROPIC_API_KEY=your_api_key_here

# 5. Start development servers
npm run dev
```

The application will start on:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001

---

## 📖 Usage

### Option 1: Client-Side Mode (Default)

1. Open http://localhost:5173
2. Enter your Anthropic API key in the UI
3. Fill out the damage assessment form
4. Click "Generate Report"
5. View your professional damage assessment

### Option 2: Server-Side Mode

1. Add `ANTHROPIC_API_KEY` to `packages/backend/.env.local`
2. Reports are generated server-side
3. No API key needed in the frontend

---

## 🏗️ Architecture

```
RestoreAssist/
├── packages/
│   ├── frontend/          # React + Vite + Tailwind
│   │   ├── src/
│   │   │   ├── components/    # UI components
│   │   │   ├── services/      # API & Claude service
│   │   │   └── types/         # TypeScript types
│   │   └── package.json
│   │
│   └── backend/           # Express + TypeScript
│       ├── src/
│       │   ├── db/            # Database layer
│       │   │   ├── migrations/    # SQL migrations
│       │   │   ├── connection.ts  # PostgreSQL pool
│       │   │   └── queries.ts     # All queries
│       │   ├── routes/        # API endpoints
│       │   ├── services/      # Business logic
│       │   ├── middleware/    # Express middleware
│       │   └── types/         # TypeScript types
│       └── package.json
│
├── API_DOCUMENTATION.md   # Complete API reference
├── POSTGRESQL_SETUP.md    # Database setup guide
└── README.md              # This file
```

---

## 📡 API Endpoints

### Reports
- `POST /api/reports` - Create AI-generated report
- `GET /api/reports` - List reports (paginated)
- `GET /api/reports/:id` - Get single report
- `PATCH /api/reports/:id` - Update report
- `DELETE /api/reports/:id` - Delete report
- `GET /api/reports/stats` - Statistics
- `DELETE /api/reports/cleanup/old` - Cleanup old reports

### Admin
- `GET /api/admin/stats` - System statistics
- `POST /api/admin/cleanup` - Admin cleanup
- `GET /api/admin/health` - Health check

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for complete API reference.

---

## 🗄️ Database

RestoreAssist supports **two database modes**:

### In-Memory (Default)
- No setup required
- Fast development
- Data lost on restart

### PostgreSQL (Production)
- Persistent storage
- Full-text search
- Comprehensive indexes
- Connection pooling

**Enable PostgreSQL**: Set `USE_POSTGRES=true` in `.env.local`

See [POSTGRESQL_SETUP.md](POSTGRESQL_SETUP.md) for setup instructions.

---

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Anthropic SDK** - Claude AI integration

### Backend
- **Express** - Web framework
- **TypeScript** - Type safety
- **pg-promise** - PostgreSQL client
- **Anthropic SDK** - Claude AI integration
- **tsx** - TypeScript execution

### Database
- **PostgreSQL** (optional) - Production database
- **In-Memory** (default) - Development storage

---

## 📝 Example Report Output

```json
{
  "reportId": "RPT-1697234567890-abc123",
  "propertyAddress": "123 Main St, Sydney NSW 2000",
  "damageType": "water",
  "state": "NSW",
  "summary": "Professional damage assessment...",
  "scopeOfWork": [
    "Emergency water extraction",
    "Remove affected drywall",
    "Dry structure with dehumidifiers",
    "Apply antimicrobial treatment",
    "Replace damaged materials"
  ],
  "itemizedEstimate": [
    {
      "description": "Emergency water extraction",
      "quantity": 1,
      "unitCost": 450.00,
      "totalCost": 450.00,
      "category": "Labor"
    }
  ],
  "totalCost": 8750.00,
  "complianceNotes": [
    "Work complies with NCC 2022 Section J",
    "NSW Building Code requirements met"
  ],
  "authorityToProceed": "Professional ATP document..."
}
```

---

## 🔧 Development

### Start Development Servers

```bash
# Both frontend and backend
npm run dev

# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend
```

### Build for Production

```bash
npm run build
```

### Run Tests

```bash
npm test
```

---

## 🌏 Australian Compliance

RestoreAssist is built specifically for the Australian market:

### States Supported
- 🏙️ NSW - New South Wales
- 🏙️ VIC - Victoria
- 🏙️ QLD - Queensland
- 🏙️ WA - Western Australia
- 🏙️ SA - South Australia
- 🏙️ TAS - Tasmania
- 🏙️ ACT - Australian Capital Territory
- 🏙️ NT - Northern Territory

### Standards Compliance
- **NCC 2022** (National Construction Code)
- State-specific building regulations
- Insurance industry requirements
- Professional reporting standards

---

## 📚 Documentation

- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - Complete API reference
- **[POSTGRESQL_SETUP.md](POSTGRESQL_SETUP.md)** - Database setup guide
- **[packages/backend/src/db/README.md](packages/backend/src/db/README.md)** - Database layer docs

---

## 🔒 Security

- API keys stored securely (localStorage or server env)
- CORS protection
- Input validation
- SQL injection prevention (parameterized queries)
- Environment-based configuration

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Anthropic** - Claude AI platform
- **React Team** - UI framework
- **Vite Team** - Build tool
- **Tailwind Labs** - CSS framework

---

## 📞 Support

For support, please open an issue in the [GitHub repository](https://github.com/CleanExpo/RestoreAssist/issues).

---

## 🚧 Roadmap

### Phase 1 (Complete) ✅
- ✅ Client-side AI integration
- ✅ Basic report generation
- ✅ Australian standards compliance
- ✅ Complete REST API
- ✅ PostgreSQL support

### Phase 2 (Planned)
- [ ] Google Drive integration
- [ ] DOCX/PDF export
- [ ] Multi-user authentication
- [ ] Report sharing
- [ ] Email notifications

### Phase 3 (Future)
- [ ] Mobile app (React Native)
- [ ] Photo upload and analysis
- [ ] CRM integrations
- [ ] Advanced analytics
- [ ] Team collaboration

---

**Built with ❤️ for the Australian restoration industry**

🤖 Powered by [Claude AI](https://www.anthropic.com/claude)
