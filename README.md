# SRM Elective Polling Backup System

A comprehensive full-stack application for managing student elective preferences and faculty allocation at SRM Institute. This system provides a secure, tiered submission workflow with real-time tracking and export capabilities.

## 📋 Project Overview

The **SRM Elective Polling Backup System** is designed to streamline the elective selection process for students and provide faculty with tools to manage allocations efficiently. The system implements a structured workflow with a built-in timer mechanism to ensure fair and orderly preference submission.

### Key Features

- **Magic Link Authentication**: Secure token-based login without passwords
- **Tiered Submission Workflow**: Timer → Preferences → Allocation → Response
- **Student Portal**: Submit elective preferences, view allocations, accept/reject offers
- **Faculty Dashboard**: Review submissions, allocate electives, export data (CSV/XLSX)
- **SRM Academia Integration**: Auto-import student details from institutional system (Zoho)
- **Real-time Notifications**: Email notifications for authentication and allocations
- **Comprehensive Export**: Generate reports in CSV and Excel formats
- **Multi-role Support**: Separate interfaces for students and faculty

---

## 🏗️ Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│  - Student Portal (Preferences & Allocation Management)          │
│  - Faculty Dashboard (Submissions Review & Export)               │
│  - Authentication (Magic Link Flow)                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP/REST API (Axios)
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│                    Backend (FastAPI)                             │
│  - Authentication & Authorization                                │
│  - Submission Lifecycle Management                               │
│  - Faculty Operations (Allocation, Export)                       │
│  - Email Service Integration (Resend)                            │
│  - Academia Scraper Integration                                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ MongoDB Driver (Motor)
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│                 MongoDB Database                                 │
│  Collections:                                                    │
│  - users (Student & Faculty profiles)                            │
│  - submissions (Preference & allocation records)                 │
│  - magic_links (Authentication tokens)                           │
│  - sessions (Active user sessions)                               │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

#### Frontend
- **React 19.0** - UI framework
- **React Router 7.15** - Client-side routing
- **Tailwind CSS 3.4** - Styling with utility classes
- **Radix UI** - Accessible component library
- **React Hook Form 7.56** - Form state management
- **TanStack Query 5.56** - Data fetching & caching
- **Axios 1.16** - HTTP client
- **Zod 3.24** - Schema validation
- **Framer Motion 11.18** - Animations
- **Recharts 3.6** - Data visualization
- **Sonner 2.0** - Toast notifications

#### Backend
- **FastAPI 0.110** - Web framework
- **Motor 3.3** - Async MongoDB driver
- **Pydantic 2.13** - Data validation
- **Pandas 3.0** - Data processing & export
- **OpenPyXL 3.1** - Excel file generation
- **Resend** - Email service integration
- **Python 3.x** - Runtime

#### Database
- **MongoDB 4.6+** - NoSQL database

---

## 📁 Project Structure

```
ACADEMIA_elective_polling_fixit/
│
├── frontend/                          # React application
│   ├── package.json                  # Dependencies and scripts
│   ├── src/
│   │   ├── components/               # Reusable React components
│   │   ├── pages/                    # Page components
│   │   │   ├── StudentPortal/
│   │   │   ├── FacultyDashboard/
│   │   │   └── Auth/
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── services/                 # API client services
│   │   ├── store/                    # State management
│   │   └── App.jsx                   # Root component
│   ├── public/                       # Static assets
│   └── README.md                     # Frontend-specific docs
│
├── backend/                          # FastAPI application
│   ├── server.py                    # Main application file
│   ├── requirements.txt              # Python dependencies
│   ├── .env                          # Environment variables
│   ├── srm_academia/                # Academia scraper module
│   │   └── import_student.py        # Student import logic
│   └── models/                       # Pydantic models
│
└── README.md                        # This file
```

---

## 🔄 Submission Workflow

The system implements a multi-stage submission lifecycle:

### Stage 1: Timer (`status: "timer"`)
- Student initiates submission
- Timer starts (default: 30 minutes)
- Student cannot proceed until timer expires
- Submission data: `started_at`, `student_id`

### Stage 2: Awaiting Preferences (`status: "awaiting_preferences"`)
- Timer has elapsed
- Student can submit elective preferences
- System tracks: elective_status, professional choices, open choices

### Stage 3: Submitted (`status: "submitted"`)
- Student successfully submitted preferences
- Faculty can now review and allocate
- Data includes preference rankings and notes

### Stage 4: Allocated (`status: "allocated"`)
- Faculty has assigned electives
- Student receives notification email
- Student can accept or reject allocation

### Stage 5: Final States
- **`accepted`**: Student accepted allocation
- **`rejected`**: Student rejected allocation (marked for re-allocation)
- **`completed_no_action`**: Student selected "both" electives (no action needed)

---

## 🔐 Authentication & Authorization

### Authentication Flow

```
1. User requests magic link via email
   POST /api/auth/request-link
   
2. Email sent with verification token
   (Mocked in dev, Resend integration for prod)
   
3. User clicks link and verifies token
   POST /api/auth/verify
   
4. Session created, bearer token issued
   
5. All subsequent requests include Authorization header
   Authorization: Bearer <session_token>
```

### Authorization

- **Students** (`role: "student"`):
  - Submit preferences
  - View own submissions
  - Respond to allocations

- **Faculty** (`role: "faculty"`):
  - View all submissions
  - Allocate electives
  - Export data
  - Send notifications

---

## 📊 Data Models

### User Model
```json
{
  "id": "uuid",
  "email": "student@srm.edu.in",
  "role": "student|faculty",
  "name": "John Doe",
  "reg_no": "RA1911001234",
  "faculty_id": "FID001",
  "department": "CSE",
  "created_at": "ISO-8601 timestamp"
}
```

### Submission Model
```json
{
  "id": "uuid",
  "student_id": "uuid",
  "status": "timer|awaiting_preferences|submitted|allocated|accepted|rejected|completed_no_action",
  "started_at": "ISO-8601",
  "submitted_at": "ISO-8601",
  "allocated_at": "ISO-8601",
  
  "elective_status": "both|partial",
  "professional": {
    "count": 2,
    "preferences": [
      ["ELEC001", "ELEC002", "ELEC003"],
      ["ELEC004", "ELEC005"]
    ]
  },
  "open": {
    "count": 1,
    "preferences": [
      ["ELEC006", "ELEC007"]
    ]
  },
  
  "allocations": {
    "professional": ["ELEC001", "ELEC004"],
    "open": ["ELEC006"]
  },
  
  "notes": "Student remarks",
  "faculty_note": "Faculty comments",
  "student_response": {
    "action": "accept|reject",
    "reason": "Optional reason",
    "at": "ISO-8601"
  },
  
  "created_at": "ISO-8601"
}
```

### Magic Link Model
```json
{
  "token": "uuid",
  "user_id": "uuid",
  "email": "user@srm.edu.in",
  "role": "student|faculty",
  "created_at": "ISO-8601",
  "used": false
}
```

### Session Model
```json
{
  "token": "uuid",
  "user_id": "uuid",
  "created_at": "ISO-8601"
}
```

---

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/request-link` - Request magic link
- `POST /api/auth/verify` - Verify token and create session
- `GET /api/auth/me` - Get current user info
- `POST /api/academia/import` - Import from SRM Academia

### Student Endpoints
- `POST /api/submissions/start` - Start new submission
- `GET /api/submissions/mine` - Get my submissions
- `POST /api/submissions/{sub_id}/preferences` - Submit preferences
- `POST /api/submissions/{sub_id}/allocation-response` - Accept/reject allocation

### Faculty Endpoints
- `GET /api/faculty/submissions` - List all submissions (with status filter)
- `GET /api/faculty/submissions/{sub_id}` - Get submission details
- `POST /api/faculty/submissions/{sub_id}/allocate` - Allocate electives
- `GET /api/faculty/submissions/export` - Export submissions (CSV/XLSX)

### Utility
- `GET /api/` - Health check

---

## 🛠️ Setup & Installation

### Prerequisites
- Python 3.8+
- Node.js 16+
- MongoDB 4.6+
- npm or yarn

### Backend Setup

1. **Install dependencies**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Environment variables needed**
   ```
   MONGO_URL=mongodb://localhost:27017
   DB_NAME=academia_polling
   TIMER_MINUTES=30
   APP_BASE_URL=http://localhost:3000
   RESEND_API_KEY=your_resend_api_key
   FROM_EMAIL=onboarding@resend.dev
   CORS_ORIGINS=http://localhost:3000
   ```

4. **Run the server**
   ```bash
   uvicorn server:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend Setup

1. **Install dependencies**
   ```bash
   cd frontend
   yarn install  # or npm install
   ```

2. **Configure API endpoint**
   - Update `.env` or environment configuration
   - Set `REACT_APP_API_URL=http://localhost:8000`

3. **Start development server**
   ```bash
   yarn start  # or npm start
   ```

4. **Build for production**
   ```bash
   yarn build  # or npm build
   ```

---

## 🧪 Testing

### Running Tests

**Frontend:**
```bash
cd frontend
yarn test
```

**Backend:**
```bash
cd backend
pytest
```

---

## 📧 Email Integration

### Resend Integration
- Sends magic links for authentication
- Notifies students of allocations
- Faculty can send custom notifications

### Development Mode
- If `RESEND_API_KEY` is not set, emails are mocked and logged
- Magic link is returned in API response for testing

---

## 💾 Database Operations

### MongoDB Collections

The system uses the following MongoDB collections:

- **users**: Stores user profiles (students and faculty)
- **submissions**: Stores submission records with preferences and allocations
- **magic_links**: Stores authentication tokens
- **sessions**: Stores active user sessions

### Indexes
Consider adding indexes for:
```javascript
db.submissions.createIndex({ "student_id": 1, "created_at": -1 })
db.submissions.createIndex({ "status": 1 })
db.magic_links.createIndex({ "token": 1 })
db.magic_links.createIndex({ "used": 1, "created_at": 1 })
db.sessions.createIndex({ "token": 1 })
```

---

## 🚀 Deployment

### Docker (Recommended)

Create a `docker-compose.yml`:
```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
  
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - MONGO_URL=mongodb://mongodb:27017
      - DB_NAME=academia_polling
    depends_on:
      - mongodb
  
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  mongo_data:
```

---

## 📈 Export Functionality

### CSV Export
- Flattens preference structures
- Includes all submission metadata
- File: `submissions.csv`

### Excel Export
- Same data as CSV
- Formatted for readability
- File: `submissions.xlsx`

### Export Columns
- submission_id, name, reg_no, email, department
- status, elective_status
- professional_count, professional_choices
- open_count, open_choices
- allocated_professional, allocated_open
- timestamps (started_at, submitted_at, allocated_at)
- student_response, notes, faculty_note

---

## 🔒 Security Considerations

- **CORS**: Configured via `CORS_ORIGINS` environment variable
- **Bearer tokens**: Used for session authentication
- **Email validation**: Pydantic EmailStr for input validation
- **Role-based access**: Student/Faculty role enforcement
- **Credential handling**: Academia credentials never logged or persisted
- **Rate limiting**: Consider implementing for production
- **HTTPS**: Required for production deployments

---

## 🐛 Troubleshooting

### Common Issues

**MongoDB Connection Error**
- Ensure MongoDB is running
- Check `MONGO_URL` environment variable
- Verify network connectivity

**Email Not Sending**
- Check `RESEND_API_KEY` configuration
- Verify sender email in `FROM_EMAIL`
- Check logs for error details

**CORS Errors**
- Update `CORS_ORIGINS` to match frontend URL
- Ensure frontend is using correct API endpoint

**Auth Issues**
- Verify magic link token hasn't expired
- Check session token in Authorization header
- Ensure user role is correct

---

## 📝 Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MONGO_URL` | MongoDB connection string | ✅ | - |
| `DB_NAME` | Database name | ✅ | - |
| `TIMER_MINUTES` | Submission timer duration | ❌ | 30 |
| `APP_BASE_URL` | Frontend URL for magic links | ❌ | "" |
| `RESEND_API_KEY` | Resend API key for emails | ❌ | "" |
| `FROM_EMAIL` | Sender email address | ❌ | onboarding@resend.dev |
| `CORS_ORIGINS` | Allowed CORS origins | ❌ | "*" |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 📄 License

This project is private and proprietary to SRM Institute.

---

## 📞 Support & Contact

For issues or questions, please refer to the project maintainers or create an issue in the repository.

---

## 🔄 Version History

- **v0.1.0** - Initial release with core functionality
  - Magic link authentication
  - Student submission workflow
  - Faculty allocation system
  - CSV/XLSX export

---

**Last Updated:** August 2026
**Status:** Active Development
