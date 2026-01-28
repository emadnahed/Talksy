
# 🎧 Real-Time AI Assistant Backend (NestJS)

A **production-grade, real-time AI assistant backend** built with **NestJS** using **WebSockets** for low-latency communication.  
Designed to be **extensible**, **scalable**, and **interview-ready**, this project demonstrates how modern AI assistants are built in real systems.

---

## 🚀 What This Project Does (Plain English)

This backend allows clients (web or mobile apps) to:
- Send messages in **real time**
- Receive **instant AI-generated responses**
- Maintain **session-based conversation context**
- Easily extend the system to support **voice, tools, or multi-agent logic**

Think of it as the **core engine behind ChatGPT-like assistants**, but simplified for clarity and learning.

---

## 🧠 Key Features

- ✅ **Real-time Communication** — WebSockets with Socket.IO
- ✅ **JWT Authentication** — Secure login with refresh token rotation
- ✅ **Auth Caching Layer** — In-memory LRU cache for sub-millisecond auth lookups
- ✅ **Multiple AI Providers** — OpenAI, Groq (free), Mock with auto-fallback
- ✅ **Session Management** — Auto-expiring sessions with reconnection support
- ✅ **Tool System** — Extensible, sandboxed tool execution
- ✅ **Rate Limiting** — Sliding window abuse protection
- ✅ **Horizontal Scaling** — Redis-backed for multi-instance deployment
- ✅ **Production Logging** — Structured JSON with HTTP/WS middleware
- ✅ **Comprehensive Testing** — 955+ tests with Jest, K6 load testing

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TALKSY BACKEND                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│   │   Clients    │    │   Clients    │    │   Clients    │                 │
│   │  (Browser)   │    │   (Mobile)   │    │    (CLI)     │                 │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                 │
│          │                   │                   │                          │
│          └───────────────────┼───────────────────┘                          │
│                              ▼                                              │
│          ┌───────────────────────────────────────┐                          │
│          │         Load Balancer / Gateway        │                          │
│          └───────────────────┬───────────────────┘                          │
│                              │                                              │
│       ┌──────────────────────┼──────────────────────┐                       │
│       ▼                      ▼                      ▼                       │
│  ┌─────────┐           ┌─────────┐           ┌─────────┐                   │
│  │ Talksy  │           │ Talksy  │           │ Talksy  │                   │
│  │ Node 1  │           │ Node 2  │           │ Node N  │                   │
│  └────┬────┘           └────┬────┘           └────┬────┘                   │
│       └─────────────────────┼─────────────────────┘                        │
│                             ▼                                              │
│          ┌──────────────────────────────────────┐                          │
│          │              Redis Cluster            │                          │
│          │  (Sessions, Tokens, WebSocket Pub/Sub)│                          │
│          └──────────────────────────────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

> 📖 **For complete architecture documentation, see [architecture.md](./architecture.md)**

### Architecture Highlights

| Component | Description |
|-----------|-------------|
| **JWT Authentication** | Stateless access tokens (15 min) + Redis-backed refresh tokens (7 days) |
| **WebSocket Gateway** | Socket.IO with Redis adapter for horizontal scaling |
| **AI Providers** | Pluggable system supporting Mock, OpenAI, and Groq |
| **Session Management** | Auto-expiring sessions with reconnection support |
| **Tool System** | Extensible, sandboxed tool execution framework |
| **Storage Layer** | Redis with automatic fallback to in-memory |

### Module Architecture

```
AppModule
├── ConfigModule (global)     → Environment validation with Joi
├── CacheModule (global)      → In-memory LRU caching for auth
├── AuthModule                → JWT authentication, user management
├── SessionModule (global)    → Conversation session lifecycle
├── AIModule (global)         → Provider orchestration (Mock/OpenAI/Groq)
├── GatewayModule             → WebSocket event handling
├── ToolsModule (global)      → Tool registration & execution
├── StorageModule (global)    → Redis/In-memory abstraction
└── RateLimitModule (global)  → Sliding window rate limiting
```

### Key Design Patterns

- **Adapter Pattern** — Storage (Redis/Memory), AI Providers
- **Guard Pattern** — JWT Auth, Rate Limiting, API Key validation
- **Provider Pattern** — Pluggable AI with automatic fallback
- **Interceptor Pattern** — Response wrapping, WebSocket logging
- **Facade Pattern** — Unified interfaces for AI and Storage

---

## 🛠 Tech Stack

| Layer | Technology |
|------|------------|
| Backend Framework | NestJS 10.x |
| Transport | WebSockets (Socket.IO 4.x) |
| Language | TypeScript 5.x |
| AI Providers | OpenAI API, Groq API (Llama 3.1) |
| Authentication | JWT, bcrypt, Passport.js |
| Cache/Storage | Redis (ioredis) with in-memory fallback |
| Validation | class-validator, Joi |
| Testing | Jest, Supertest |
| Architecture | Modular, horizontally scalable |

---

## 📁 Project Structure

```
src/
├── main.ts                      # Application bootstrap
├── app.module.ts                # Root module
├── app.controller.ts            # Health & info endpoints
│
├── auth/                        # 🔐 Authentication Module
│   ├── auth.module.ts
│   ├── auth.service.ts          # JWT & refresh token logic
│   ├── auth.controller.ts       # Auth endpoints
│   ├── auth.guard.ts            # JWT guard (HTTP + WebSocket)
│   ├── dto/                     # Register, Login, Refresh DTOs
│   └── interfaces/              # JWT payload, Auth user types
│
├── user/                        # 👤 User Module
│   ├── user.service.ts          # User CRUD, bcrypt hashing
│   └── user.entity.ts           # User model
│
├── gateway/                     # 🔌 WebSocket Gateway
│   ├── assistant.gateway.ts     # Main WebSocket handler
│   └── filters/                 # WebSocket exception filters
│
├── ai/                          # 🤖 AI Provider Module
│   ├── ai.service.ts            # Provider orchestration
│   └── providers/
│       ├── mock-ai.provider.ts  # Built-in mock (always available)
│       ├── openai.provider.ts   # OpenAI integration
│       └── groq.provider.ts     # Groq API (free tier)
│
├── session/                     # 💬 Session Module
│   └── session.service.ts       # Session lifecycle management
│
├── tools/                       # 🔧 Tools Module
│   └── services/
│       ├── tool-registry.service.ts
│       └── tool-executor.service.ts
│
├── storage/                     # 💾 Storage Module
│   ├── storage.service.ts       # Adapter orchestration
│   └── adapters/
│       ├── redis-storage.adapter.ts
│       └── in-memory-storage.adapter.ts
│
├── rate-limit/                  # 🚦 Rate Limiting
│   ├── rate-limit.service.ts    # Sliding window algorithm
│   └── rate-limit.guard.ts
│
├── adapters/
│   └── redis-io.adapter.ts      # Socket.IO Redis adapter
│
└── common/                      # 🔄 Shared Utilities
    ├── dto/                     # Response DTOs
    ├── guards/                  # API key guard
    ├── interceptors/            # Response, logging interceptors
    ├── filters/                 # HTTP exception filter
    └── middleware/              # Logging middleware
```

This structure follows **production NestJS patterns** with clear separation of concerns.

---

## 🔌 WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `user_message` | `{ text: string }` | Send message, get response |
| `user_message_stream` | `{ text: string }` | Send message, get streamed response |
| `get_history` | `{}` | Get conversation history |
| `get_session_info` | `{}` | Get session metadata |
| `list_tools` | `{ category?: string }` | List available tools |
| `call_tool` | `{ toolName, parameters, callId? }` | Execute a tool |
| `get_tool_info` | `{ toolName: string }` | Get tool definition |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `assistant_response` | `{ text, timestamp }` | AI response |
| `stream_start` | `{ sessionId }` | Stream beginning |
| `stream_chunk` | `{ content, index }` | Stream token |
| `stream_end` | `{ sessionId }` | Stream complete |
| `SESSION_CREATED` | `{ sessionId, expiresAt }` | New session |
| `SESSION_RESTORED` | `{ sessionId, history }` | Reconnection |
| `conversation_history` | `Message[]` | History response |
| `session_info` | `{ status, messageCount }` | Session metadata |
| `tools_list` | `ToolDefinition[]` | Available tools |
| `tool_result` | `{ callId, result }` | Tool execution result |
| `rate_limit` | `{ remaining, resetAt }` | Rate limit warning |
| `error` | `{ code, message }` | Error notification |

---

## 🔗 REST API Endpoints

### Authentication
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login, get tokens | No |
| POST | `/auth/refresh` | Refresh access token | No |
| POST | `/auth/logout` | Revoke refresh token | No |
| GET | `/auth/me` | Get current user | Yes |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Application info |
| GET | `/health` | Simple health check |
| GET | `/health/detailed` | Component health status |

### Authentication Example
```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Password123"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Password123"}'

# Get user info (protected)
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer <access_token>"
```

---

## ▶️ Running the Project

### 1️⃣ Install Dependencies
```bash
npm install
```

### 2️⃣ Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

**Key Configuration Options:**
```bash
# Core
PORT=3000
NODE_ENV=development

# AI Provider (mock, openai, groq)
AI_PROVIDER=mock
OPENAI_API_KEY=sk-...          # For OpenAI
GROQ_API_KEY=gsk_...           # For Groq (free tier)

# Authentication
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Redis (optional, enables horizontal scaling)
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
```

### 3️⃣ Start Development Server
```bash
npm run start:dev
```

Server runs by default on:
```
http://localhost:3000
ws://localhost:3000
```

---

## 🧪 Testing

This project follows **strict Test-Driven Development (TDD)** with **955+ tests** achieving **90%+ coverage**.

### Quick Start
```bash
# Run full orchestrated test suite (recommended)
npm run test:full:docker      # Handles infrastructure, runs all tests, cleans up

# Or run tests individually
npm run test:unit             # 737 unit tests
npm run test:integration      # 132 integration tests
npm run test:e2e              # 73 E2E tests
npm run test:latency          # 13 latency/performance tests
```

### Test Categories

| Category | Tests | Command | Description |
|----------|-------|---------|-------------|
| Unit | 737 | `npm run test:unit` | Fast, isolated tests |
| Integration | 132 | `npm run test:integration` | Service interaction tests |
| E2E | 73 | `npm run test:e2e` | Full application flow tests |
| Latency | 13 | `npm run test:latency` | Performance threshold tests |
| **Total Jest** | **955** | `npm test` | All Jest tests |

### K6 Load Testing
```bash
npm run k6:latency:smoke      # Latency benchmarks (all endpoints)
npm run k6:cache:smoke        # Cache stress tests
npm run test:k6:smoke         # WebSocket smoke tests
npm run k6:local              # Full K6 test suite
```

### Full Test Suite (Orchestrated)
```bash
# Local environment (requires local Redis)
npm run test:full:local

# Docker environment (recommended)
npm run test:full:docker

# Remote environments
npm run test:full:vps
npm run test:full:staging
npm run test:full:production
```

### Coverage
```bash
npm run test:coverage         # Generate coverage report
npm run test:ci               # CI pipeline with coverage
```

Coverage thresholds enforced: **90% branches, functions, lines, statements**

For detailed testing documentation, see [docs/TESTING.md](./docs/TESTING.md).

---

## 📋 Development Phases

This project is built incrementally using TDD. Each phase is deployable.

### Phase 0: Setup ✅
- [x] Project structure (NestJS + TypeScript)
- [x] ESLint + Prettier configuration
- [x] Jest (unit/integration) + Supertest (E2E) testing
- [x] Environment configuration with Joi validation
- [x] Git initialization
- [x] Health check endpoints (simple + detailed)

### Phase 1: WebSocket Gateway ✅
- [x] Socket.IO gateway setup
- [x] Connection/disconnection handling
- [x] Message events (`user_message`, `assistant_response`)
- [x] Streaming support (`user_message_stream`)
- [x] WebSocket exception filter
- [x] WebSocket logging interceptor

### Phase 2: Session Management ✅
- [x] In-memory session storage
- [x] Redis session storage (optional)
- [x] Session creation on connection
- [x] Session restoration on reconnection
- [x] Disconnect grace period (5 min)
- [x] Session TTL management (15 min default)
- [x] Conversation history (max 100 messages)

### Phase 3: AI Integration ✅
- [x] AI service abstraction layer
- [x] Mock provider (always available)
- [x] OpenAI provider implementation
- [x] Groq provider (free tier: 30 req/min)
- [x] Automatic fallback to mock
- [x] Token streaming support
- [x] Error handling

### Phase 4: Production Hardening ✅
- [x] Redis session/token storage
- [x] Sliding window rate limiting
- [x] JWT authentication (access + refresh tokens)
- [x] User registration & login
- [x] Request validation DTOs
- [x] Structured JSON logging
- [x] HTTP request logging middleware
- [x] Response interceptor (standard format)
- [x] Global exception filter

### Phase 5: Advanced Features ✅
- [x] Tool registration system
- [x] Tool execution with sandboxing
- [x] Tool timeout enforcement
- [x] Concurrency control
- [x] Tool categorization

### Phase 6: Auth Caching Layer ✅
- [x] In-memory LRU cache implementation
- [x] Token validation caching (skip repeated JWT verification)
- [x] User profile caching (avoid Redis lookups)
- [x] Configurable TTL and max size
- [x] Cache invalidation on logout
- [x] Sub-millisecond cache hit latency

### Phase 7: Future Enhancements (Pending)
- [ ] Multi-agent orchestration
- [ ] Persistent conversation history (database)
- [ ] Voice AI integration (STT/TTS)
- [ ] WebRTC support for calls

---

## 🧪 Example WebSocket Flow

1. Client connects via Socket.IO
2. Client emits `user_message`
3. Backend:
   - Retrieves session context
   - Calls AI service
   - Generates response
4. Server emits `assistant_response`
5. Client updates UI instantly

---

## 🔒 Production Features

This project includes production-grade features:

| Feature | Status | Details |
|---------|--------|---------|
| 🔐 Authentication | ✅ Done | JWT with refresh token rotation |
| ⚡ Auth Caching | ✅ Done | In-memory LRU cache (~0.1ms lookups) |
| 🚦 Rate Limiting | ✅ Done | Sliding window algorithm |
| 🧠 Redis Storage | ✅ Done | Sessions, tokens, users |
| 📡 Streaming | ✅ Done | Token-by-token AI responses |
| 📊 Logging | ✅ Done | Structured JSON, HTTP middleware |
| 🔄 Horizontal Scaling | ✅ Done | Socket.IO Redis adapter |
| 🔧 Tool System | ✅ Done | Sandboxed execution |
| ⚡ Fallback | ✅ Done | Auto-fallback for Redis & AI |
| 🧪 Testing | ✅ Done | 955+ tests, K6 load testing |

---

## 🔮 Roadmap

| Feature | Priority | Status |
|---------|----------|--------|
| Auth caching layer | High | ✅ Done |
| Database persistence | Medium | Pending |
| Multi-agent orchestration | Medium | Pending |
| Voice AI (STT + TTS) | Low | Pending |
| WebRTC support | Low | Pending |

---

## 🎯 Why This Project Matters

This project demonstrates **production-grade patterns**:

| Aspect | Implementation |
|--------|----------------|
| **Architecture** | Modular NestJS with clear separation of concerns |
| **Authentication** | JWT with refresh token rotation (industry standard) |
| **Scalability** | Stateless tokens + Redis for horizontal scaling |
| **AI Integration** | Provider abstraction with automatic fallback |
| **Real-time** | WebSocket with session management |
| **Security** | Rate limiting, input validation, bcrypt hashing |
| **Testing** | 955+ tests with 90%+ coverage |

**Perfect for:**
- Backend engineering portfolios
- Senior-level system design interviews
- AI product prototypes
- Production startup MVPs

---

## 📄 License

MIT — free to use, modify, and extend.
