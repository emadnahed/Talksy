
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

- ✅ Real-time communication using WebSockets (Socket.IO)
- ✅ Clean, modular NestJS architecture
- ✅ AI abstraction layer (OpenAI / Local LLM ready)
- ✅ Session-based conversation memory
- ✅ Low-latency request/response flow
- ✅ Designed for scaling (Redis, streaming, voice)

---

## 🏗️ System Architecture

```
Client (Web / Mobile)
        │
   WebSocket (Socket.IO)
        │
┌──────────────────┐
│ NestJS Gateway   │
└───────┬──────────┘
        │
┌──────────────────┐
│ AI Service       │──▶ OpenAI / LLaMA / Local LLM
└───────┬──────────┘
        │
┌──────────────────┐
│ Session Storage  │ (In-memory → Redis)
└──────────────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology |
|------|------------|
| Backend Framework | NestJS |
| Transport | WebSockets (Socket.IO) |
| Language | TypeScript |
| AI Provider | OpenAI / Local LLM |
| State | In-memory (Redis-ready) |
| Architecture | Modular, service-oriented |

---

## 📁 Project Structure

```
src/
│
├── app.module.ts
│
├── gateway/
│   └── assistant.gateway.ts   # WebSocket entry point
│
├── ai/
│   ├── ai.module.ts
│   └── ai.service.ts          # AI abstraction layer
│
├── session/
│   └── session.service.ts     # Session memory management
│
└── common/
    └── dto/                   # Shared data contracts
```

This structure mirrors **real-world NestJS backends** used in production.

---

## 🔌 WebSocket Events

### Client → Server
| Event | Payload |
|------|--------|
| `user_message` | `{ text: string }` |

### Server → Client
| Event | Payload |
|------|--------|
| `assistant_response` | `{ text: string, timestamp: number }` |

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

This project follows **strict Test-Driven Development (TDD)**.

### Run All Tests
```bash
npm test
```

### Run Unit Tests
```bash
npm run test:unit
```

### Run Integration Tests
```bash
npm run test:integration
```

### Run E2E Tests
```bash
npm run test:e2e
```

### Run Tests with Coverage
```bash
npm run test:cov
```

### Run Comprehensive Test Suite
```bash
npm run test:comprehensive
```

### Run API Performance Tests
```bash
npm run test:api                    # Basic API tests
npm run test:api:performance        # Performance tests
npm run test:api:load               # Load tests
npm run test:api:comprehensive      # Comprehensive API tests
npm run test:api:comprehensive:v2   # Alternative comprehensive tests
npm run test:api:performance:basic  # Basic performance tests
npm run test:api:performance:enhanced # Enhanced performance tests
```

### Run All Tests Including API
```bash
npm run test:all
```

### Run Tests in Docker Environment
```bash
# Build and run tests in Docker
npm run docker:test

# Run all tests in Docker
npm run docker:test:all

# Run Docker integration tests
npm run test:integration:docker

# View Docker logs
npm run docker:logs
```

### Run Specific Test Categories
```bash
# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only end-to-end tests
npm run test:e2e

# Run tests with watch mode
npm run test:watch
```

### Interactive Test Runner
```bash
# Use the interactive test runner
npm run test:run help
npm run test:run all
npm run test:run api
npm run test:run docker
npm run test:run coverage
```

### Test Organization
Tests are organized in the `test-scripts/` directory with the following structure:
- `api/` - API-specific tests
- `performance/` - Performance and benchmarking tests
- `load/` - Load and stress tests
- `integration/` - Integration and environment tests
- `unit/` and `e2e/` - Handled by Jest framework

For more details about the testing structure, see [test-scripts/README.md](./test-scripts/README.md).

---

## 📋 Development Phases

This project is built incrementally using TDD. Each phase is deployable.

### Phase 0: Setup ✅
- [x] Project structure (NestJS + TypeScript)
- [x] ESLint + Prettier configuration
- [x] Jest (unit/integration) + Supertest (E2E) testing
- [x] Environment configuration
- [x] Git initialization
- [x] Health check endpoint

### Phase 1: WebSocket Gateway (Pending)
- [ ] Socket.IO gateway setup
- [ ] Connection/disconnection handling
- [ ] Basic message events (`user_message`, `assistant_response`)
- [ ] WebSocket E2E tests
- [ ] Error handling for WebSocket events

### Phase 2: Session Management (Pending)
- [ ] In-memory session storage
- [ ] Session creation on connection
- [ ] Session cleanup on disconnection
- [ ] Session context retrieval
- [ ] Session TTL management

### Phase 3: AI Integration (Pending)
- [ ] AI service abstraction layer
- [ ] OpenAI provider implementation
- [ ] Conversation context handling
- [ ] Token streaming support
- [ ] Error handling and retries

### Phase 4: Production Hardening (Pending)
- [ ] Redis session storage
- [ ] Rate limiting
- [ ] Authentication middleware
- [ ] Request validation DTOs
- [ ] Comprehensive logging
- [ ] Health check enhancements

### Phase 5: Advanced Features (Pending)
- [ ] Tool calling support
- [ ] Multi-agent orchestration
- [ ] Persistent conversation history
- [ ] Voice AI integration (STT/TTS)

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

## 🔒 Production Considerations

This MVP is intentionally simple. In real production systems, you would add:

- 🔐 Authentication & authorization
- 🚦 Rate limiting & abuse protection
- 🧠 Redis-based session storage
- 📡 Streaming token responses
- 📊 Logging & observability
- 🔄 Horizontal scaling

---

## 🔮 Future Enhancements

- Real-time token streaming
- Voice AI (STT + TTS)
- Tool calling (search, DB, APIs)
- Multi-agent orchestration
- Persistent conversation history
- WebRTC support for calls

---

## 🎯 Why This Project Matters

This project demonstrates:
- Real-time backend design
- Clean NestJS architecture
- AI system thinking (not just API calls)
- Production-aligned engineering decisions

Perfect for:
- Backend portfolios
- Senior-level interviews
- AI product prototypes
- Startup MVPs

---

## 📄 License

MIT — free to use, modify, and extend.
