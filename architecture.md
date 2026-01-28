# Talksy Backend Architecture

> A horizontally scalable real-time AI assistant backend built with NestJS

---

## Table of Contents

1. [Overview](#overview)
2. [Beginner's Guide - Understanding the Backend](#beginners-guide---understanding-the-backend)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Module Architecture](#module-architecture)
6. [Authentication System](#authentication-system)
7. [Auth Caching Layer](#auth-caching-layer)
8. [Session Management](#session-management)
9. [AI Provider System](#ai-provider-system)
10. [Tools System](#tools-system)
11. [WebSocket Gateway](#websocket-gateway)
12. [Storage Layer](#storage-layer)
13. [Rate Limiting](#rate-limiting)
14. [API Endpoints](#api-endpoints)
15. [Data Flow Patterns](#data-flow-patterns)
16. [Configuration](#configuration)
17. [Design Patterns](#design-patterns)
18. [Testing Infrastructure](#testing-infrastructure)
19. [Horizontal Scaling](#horizontal-scaling)
20. [DevOps Guide - Beginner to Advanced](#devops-guide---beginner-to-advanced)

---

## Overview

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
│                              │                                              │
│                              ▼                                              │
│          ┌───────────────────────────────────────┐                          │
│          │         Load Balancer / Gateway        │                          │
│          └───────────────────┬───────────────────┘                          │
│                              │                                              │
│       ┌──────────────────────┼──────────────────────┐                       │
│       │                      │                      │                       │
│       ▼                      ▼                      ▼                       │
│  ┌─────────┐           ┌─────────┐           ┌─────────┐                   │
│  │ Talksy  │           │ Talksy  │           │ Talksy  │                   │
│  │ Node 1  │           │ Node 2  │           │ Node N  │                   │
│  │         │           │         │           │         │                   │
│  │┌───────┐│           │┌───────┐│           │┌───────┐│                   │
│  ││LRU    ││           ││LRU    ││           ││LRU    ││                   │
│  ││Cache  ││           ││Cache  ││           ││Cache  ││                   │
│  │└───────┘│           │└───────┘│           │└───────┘│                   │
│  └────┬────┘           └────┬────┘           └────┬────┘                   │
│       │                     │                     │                        │
│       └─────────────────────┼─────────────────────┘                        │
│                             │                                              │
│                             ▼                                              │
│          ┌──────────────────────────────────────┐                          │
│          │              Redis Cluster            │                          │
│          │  (Sessions, Tokens, WebSocket Pub/Sub)│                          │
│          └──────────────────────────────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Features

- **JWT Authentication** - Stateless access tokens for horizontal scaling
- **Auth Caching Layer** - In-memory LRU cache for reduced auth latency
- **Real-time Communication** - WebSocket-based messaging with Socket.IO
- **Multiple AI Providers** - Pluggable architecture (Mock, OpenAI, Groq)
- **Tool System** - Extensible, sandboxed tool execution
- **Session Management** - Automatic lifecycle with reconnection support
- **Rate Limiting** - Sliding window algorithm for abuse prevention
- **Redis Integration** - Optional Redis for horizontal scaling

---

## Beginner's Guide - Understanding the Backend

> **New to backend development?** This section explains each component in simple terms before diving into the technical details.

### What is a Backend?

Think of a backend as the "brain" behind an application. When you use an app (like a chat app), the frontend is what you see and interact with. The backend is the server that:
- Stores your data (messages, user accounts)
- Processes your requests (sending a message)
- Handles security (making sure only you can access your account)
- Connects to external services (like AI providers)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HOW THE BACKEND FITS IN                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   YOU (User)                                                                 │
│      │                                                                       │
│      │ "Send message: Hello!"                                               │
│      ▼                                                                       │
│   ┌─────────────────┐                                                       │
│   │    FRONTEND     │  ← What you see (Website, Mobile App)                 │
│   │  (React, Vue)   │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                 │
│            │ HTTP Request / WebSocket                                        │
│            ▼                                                                 │
│   ┌─────────────────┐                                                       │
│   │    BACKEND      │  ← THIS PROJECT (Talksy) ✓                            │
│   │   (NestJS)      │     - Validates your request                          │
│   │                 │     - Checks if you're logged in                      │
│   │                 │     - Sends message to AI                             │
│   │                 │     - Saves to database                               │
│   │                 │     - Returns AI response                             │
│   └────────┬────────┘                                                       │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                       │
│   │    DATABASE     │  ← Where data lives (Redis in our case)               │
│   │    (Redis)      │                                                       │
│   └─────────────────┘                                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Backend Concepts Explained

#### 1. **API (Application Programming Interface)**

An API is like a restaurant menu. It tells you what you can order (request) and what you'll get back (response).

```
You: "GET /auth/me"  (like ordering "Show me my profile")
Server: { "email": "you@example.com", "id": "123" }
```

**HTTP Methods (Types of requests):**
| Method | Purpose | Example |
|--------|---------|---------|
| GET | Read data | Get user profile |
| POST | Create data | Register new user |
| PUT | Update data | Change password |
| DELETE | Remove data | Delete account |

#### 2. **Authentication vs Authorization**

These are often confused but are different:

```
┌─────────────────────────────────────────────────────────────────┐
│   AUTHENTICATION                    AUTHORIZATION               │
│   "Who are you?"                    "What can you do?"          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Login Process:                    Permission Check:           │
│   ┌─────────┐                       ┌─────────┐                 │
│   │ Email   │                       │  User   │───► View own    │
│   │ Password│                       │  Role   │     profile? ✓  │
│   └────┬────┘                       └────┬────┘                 │
│        │                                 │                      │
│        ▼                                 ▼                      │
│   "Yes, you are John"               "Can John delete           │
│                                      other users? ✗"           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3. **JWT (JSON Web Token)**

A JWT is like a digital ID card. After you login, the server gives you a token that proves who you are.

```
┌─────────────────────────────────────────────────────────────────┐
│   HOW JWT WORKS                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   STEP 1: Login                                                  │
│   You: "Here's my email and password"                           │
│   Server: "Verified! Here's your JWT token"                     │
│                                                                  │
│   STEP 2: Use the Token                                          │
│   You: "GET /auth/me + Bearer eyJhbGc..."                       │
│   Server: "Token valid! Here's your profile"                    │
│                                                                  │
│   TOKEN STRUCTURE:                                               │
│   ┌────────────────────────────────────────────────────────┐    │
│   │  HEADER    │      PAYLOAD       │      SIGNATURE       │    │
│   │  (type)    │  (your user info)  │  (server's seal)     │    │
│   │            │                    │                       │    │
│   │  "JWT"     │  {                 │  Secret key ensures  │    │
│   │            │    sub: "user-id", │  nobody can fake     │    │
│   │            │    email: "...",   │  this token          │    │
│   │            │    exp: timestamp  │                       │    │
│   │            │  }                 │                       │    │
│   └────────────────────────────────────────────────────────┘    │
│                                                                  │
│   WHY TWO TOKENS?                                                │
│   • Access Token: Short-lived (15 min), used for requests       │
│   • Refresh Token: Long-lived (7 days), gets new access token   │
│                                                                  │
│   This way, if someone steals your access token, it expires     │
│   quickly. The refresh token is stored securely.                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 4. **HTTP vs WebSocket**

```
┌─────────────────────────────────────────────────────────────────┐
│   HTTP (Request-Response)            WEBSOCKET (Real-time)      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Client ──Request──► Server         Client ◄──────► Server     │
│   Client ◄─Response── Server         (Always connected)         │
│   (Connection closes)                                            │
│                                                                  │
│   Like sending a letter:             Like a phone call:         │
│   - Send request                     - Stay connected           │
│   - Wait for reply                   - Talk anytime             │
│   - Done                             - Either side can start    │
│                                                                  │
│   WHEN TO USE:                       WHEN TO USE:               │
│   • Login/Register                   • Chat messages            │
│   • Get user profile                 • Live notifications       │
│   • One-time data fetch              • Real-time updates        │
│                                                                  │
│   In Talksy:                         In Talksy:                 │
│   /auth/login (HTTP)                 user_message (WebSocket)   │
│   /auth/me (HTTP)                    assistant_response (WS)    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 5. **Redis (In-Memory Database)**

Redis is a super-fast database that stores data in memory (RAM) instead of disk.

```
┌─────────────────────────────────────────────────────────────────┐
│   TRADITIONAL DB vs REDIS                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Traditional (Disk)                 Redis (Memory/RAM)         │
│   ┌─────────────┐                    ┌─────────────┐            │
│   │  Hard Drive │                    │     RAM     │            │
│   │  ┌───────┐  │                    │  ┌───────┐  │            │
│   │  │ Data  │  │  ~5-10ms           │  │ Data  │  │  ~0.1ms    │
│   │  └───────┘  │  per read          │  └───────┘  │  per read  │
│   └─────────────┘                    └─────────────┘            │
│                                                                  │
│   WHAT TALKSY STORES IN REDIS:                                  │
│   • User sessions (who's logged in)                             │
│   • Refresh tokens (for re-authentication)                      │
│   • User data (profiles)                                        │
│   • Chat history (conversations)                                │
│                                                                  │
│   KEY-VALUE STRUCTURE:                                           │
│   "talksy:user:abc123" → { email: "john@...", ... }             │
│   "talksy:session:xyz" → { history: [...], ... }                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 6. **Caching (LRU Cache)**

Caching is storing frequently accessed data closer to where it's needed.

```
┌─────────────────────────────────────────────────────────────────┐
│   WITHOUT CACHE                      WITH CACHE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Request 1: Who is user 123?        Request 1: Who is user 123?│
│   → Go to Redis → 5ms                → Check cache (miss)       │
│                                       → Go to Redis → 5ms       │
│   Request 2: Who is user 123?        → Store in cache           │
│   → Go to Redis → 5ms                                            │
│                                       Request 2: Who is user 123?│
│   Request 3: Who is user 123?        → Check cache (HIT!) → 0.1ms│
│   → Go to Redis → 5ms                                            │
│                                       Request 3: Who is user 123?│
│   Total: 15ms                        → Check cache (HIT!) → 0.1ms│
│                                                                  │
│                                       Total: 5.2ms (3x faster!)  │
│                                                                  │
│   LRU = "Least Recently Used"                                    │
│   When cache is full, it removes the oldest unused items.        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 7. **Rate Limiting**

Rate limiting protects your server from being overwhelmed.

```
┌─────────────────────────────────────────────────────────────────┐
│   RATE LIMITING                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Rule: Max 10 requests per 60 seconds                           │
│                                                                  │
│   Normal User:                       Attacker/Bot:               │
│   Request 1: ✓                       Request 1-10: ✓            │
│   Request 2: ✓                       Request 11: ✗ (blocked!)   │
│   ...                                "Try again in 45 seconds"  │
│   Request 8: ✓                                                  │
│   (takes a break)                                               │
│                                                                  │
│   WHY IT MATTERS:                                                │
│   • Prevents abuse (spam, attacks)                              │
│   • Keeps server responsive for everyone                        │
│   • Reduces AI API costs                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 8. **Modules (NestJS Architecture)**

NestJS organizes code into "modules" - like departments in a company.

```
┌─────────────────────────────────────────────────────────────────┐
│   MODULE STRUCTURE                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Think of a company:                                            │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    THE COMPANY (AppModule)               │   │
│   │                                                          │   │
│   │   ┌────────────┐  ┌────────────┐  ┌────────────┐        │   │
│   │   │ Auth Dept  │  │ User Dept  │  │ AI Dept    │        │   │
│   │   │ (AuthModule)│  │(UserModule)│  │ (AIModule) │        │   │
│   │   │            │  │            │  │            │        │   │
│   │   │ - Login    │  │ - Create   │  │ - Chat     │        │   │
│   │   │ - Register │  │ - Update   │  │ - Stream   │        │   │
│   │   │ - Logout   │  │ - Delete   │  │ - Tools    │        │   │
│   │   └────────────┘  └────────────┘  └────────────┘        │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   EACH MODULE HAS:                                               │
│   • Controller: Handles incoming requests (receptionist)        │
│   • Service: Business logic (the actual workers)                │
│   • DTOs: Data validation (forms to fill out)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 9. **Environment Variables**

Environment variables are settings that change based on where your app runs.

```
┌─────────────────────────────────────────────────────────────────┐
│   ENVIRONMENT VARIABLES                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Same code, different settings:                                 │
│                                                                  │
│   DEVELOPMENT (.env.local)           PRODUCTION (.env.prod)     │
│   ├── PORT=3000                      ├── PORT=80                │
│   ├── REDIS_ENABLED=false            ├── REDIS_ENABLED=true     │
│   ├── LOG_LEVEL=debug                ├── LOG_LEVEL=warn         │
│   └── AUTH_BYPASS_IN_DEV=true        └── AUTH_BYPASS_IN_DEV=false│
│                                                                  │
│   WHY?                                                           │
│   • Keep secrets out of code (API keys, passwords)              │
│   • Different settings for dev/staging/production               │
│   • Easy to change without modifying code                       │
│                                                                  │
│   NEVER commit .env files with real secrets to Git!             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 10. **Guards, Interceptors, and Middleware**

These are checkpoints that requests pass through:

```
┌─────────────────────────────────────────────────────────────────┐
│   REQUEST PIPELINE                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Request arrives                                                │
│        │                                                         │
│        ▼                                                         │
│   ┌─────────────┐                                               │
│   │ MIDDLEWARE  │  ← Runs first, for ALL requests               │
│   │ (Logging)   │    "Let me log this request"                  │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │   GUARD     │  ← Security checkpoint                        │
│   │ (Auth Check)│    "Are you allowed in?"                      │
│   └──────┬──────┘    ✗ → 401 Unauthorized                       │
│          │ ✓                                                     │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │ INTERCEPTOR │  ← Transform request/response                 │
│   │ (Transform) │    "Let me format the response"               │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │ CONTROLLER  │  ← Your actual endpoint code                  │
│   │ (Handler)   │    "Here's your data"                         │
│   └─────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Quick Reference: Files You'll Work With

| File | What It Does | When You'll Edit It |
|------|--------------|---------------------|
| `src/auth/auth.service.ts` | Login/register logic | Adding auth features |
| `src/user/user.service.ts` | User CRUD operations | User management |
| `src/gateway/assistant.gateway.ts` | WebSocket handlers | Chat features |
| `src/ai/ai.service.ts` | AI provider logic | AI integrations |
| `src/config/config.schema.ts` | Environment validation | Adding new configs |
| `.env` | Your local settings | Local development |

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | NestJS 10.x |
| **Language** | TypeScript 5.x |
| **Runtime** | Node.js 18+ |
| **WebSocket** | Socket.IO 4.x |
| **Cache/Storage** | Redis (ioredis), In-memory LRU |
| **Authentication** | JWT (nestjs/jwt), bcrypt 6.x, Passport.js |
| **Validation** | class-validator, class-transformer, Joi |
| **AI Providers** | OpenAI API, Groq API |
| **Testing** | Jest 29, Supertest, K6, Autocannon |
| **Infrastructure** | Docker, Docker Compose |

---

## Project Structure

```
src/
├── main.ts                      # Application bootstrap
├── app.module.ts                # Root module
├── app.controller.ts            # Health & info endpoints
├── app.service.ts               # App service
│
├── config/
│   └── config.schema.ts         # Joi validation schema
│
├── cache/                       # Cache Module
│   ├── cache.module.ts          # NestJS module
│   ├── cache.service.ts         # LRU cache management
│   ├── lru-cache.ts             # LRU cache implementation
│   └── interfaces/
│       └── cache.interface.ts   # Cache interface definitions
│
├── auth/                        # Authentication Module
│   ├── auth.module.ts
│   ├── auth.service.ts          # JWT & refresh token logic
│   ├── auth.controller.ts       # Auth endpoints
│   ├── auth.guard.ts            # JWT guard (HTTP + WebSocket)
│   ├── decorators/
│   │   └── current-user.decorator.ts
│   ├── dto/
│   │   ├── register.dto.ts
│   │   ├── login.dto.ts
│   │   └── refresh-token.dto.ts
│   └── interfaces/
│       ├── jwt-payload.interface.ts
│       └── auth-user.interface.ts
│
├── user/                        # User Module
│   ├── user.module.ts
│   ├── user.service.ts          # User CRUD, password hashing
│   ├── user.entity.ts
│   └── interfaces/
│       └── user.interface.ts
│
├── session/                     # Session Module
│   ├── session.module.ts
│   ├── session.service.ts       # Session lifecycle
│   ├── constants/
│   ├── dto/
│   └── interfaces/
│
├── ai/                          # AI Provider Module
│   ├── ai.module.ts
│   ├── ai.service.ts            # Provider orchestration
│   ├── providers/
│   │   ├── mock-ai.provider.ts
│   │   ├── openai.provider.ts
│   │   └── groq.provider.ts
│   └── interfaces/
│
├── gateway/                     # WebSocket Gateway
│   ├── gateway.module.ts
│   ├── assistant.gateway.ts     # Main WebSocket handler
│   ├── dto/
│   └── filters/
│       └── ws-exception.filter.ts
│
├── tools/                       # Tools Module
│   ├── tools.module.ts
│   ├── services/
│   │   ├── tool-registry.service.ts
│   │   └── tool-executor.service.ts
│   └── interfaces/
│
├── storage/                     # Storage Module
│   ├── storage.module.ts
│   ├── storage.service.ts
│   ├── adapters/
│   │   ├── in-memory-storage.adapter.ts
│   │   └── redis-storage.adapter.ts
│   └── interfaces/
│
├── redis/                       # Redis Module
│   ├── redis.module.ts          # Global Redis module
│   └── redis-pool.service.ts    # Shared connection pool
│
├── rate-limit/                  # Rate Limiting Module
│   ├── rate-limit.module.ts
│   ├── rate-limit.service.ts
│   ├── rate-limit.guard.ts
│   └── interfaces/
│
├── adapters/
│   └── redis-io.adapter.ts      # Socket.IO Redis adapter
│
└── common/                      # Shared Utilities
    ├── dto/
    │   └── api-response.dto.ts  # Standard API response format
    ├── guards/
    │   └── api-key.guard.ts     # API key authentication
    ├── interceptors/
    │   ├── response.interceptor.ts
    │   └── ws-logging.interceptor.ts
    ├── filters/
    │   └── http-exception.filter.ts
    └── middleware/
        └── logging.middleware.ts # HTTP request logging
```

---

## Module Architecture

### Dependency Graph

```
                              AppModule
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
   ConfigModule              EventEmitter              RedisModule
   (global)                  Module (global)            (global)
        │                                                   │
        │         ┌─────────────────────────────────────────┤
        │         │                                         │
        ▼         ▼                                         ▼
   CacheModule  StorageModule                         SessionModule
   (global)     (global)                               (global)
        │         │                                         │
        │         │                                         │
        └────┬────┘                                         │
             │                                              │
        ┌────┴────┐                                         │
        │         │                                         │
   UserModule  AuthModule                                   │
        │         │                                         │
        └────┬────┘                                         │
             │                                              │
        ┌────┴────┐                                         │
        │         │                                         │
        │   JWT   │                                         │
        │ Module  │                                         │
        └─────────┘                                         │
                                                            │
        ┌───────────────────────────────────────────────────┤
        │                                                   │
        ▼                                                   ▼
   AIModule                                         GatewayModule
   (global)                                               │
        │                                                  │
        ├── MockProvider                                   │
        ├── OpenAIProvider                                 │
        └── GroqProvider                                   │
                                                           │
        ┌──────────────────────────────────────────────────┤
        │                                                  │
        ▼                                                  ▼
   ToolsModule                                    RateLimitModule
   (global)                                         (global)
        │
        ├── ToolRegistryService
        └── ToolExecutorService
```

### Module Responsibilities

| Module | Scope | Responsibility |
|--------|-------|----------------|
| **ConfigModule** | Global | Environment configuration with Joi validation |
| **RedisModule** | Global | Shared Redis connection pool management |
| **CacheModule** | Global | In-memory LRU caching for auth and user data |
| **AuthModule** | Local | JWT authentication, user login/register |
| **UserModule** | Local | User CRUD, password hashing with bcrypt |
| **SessionModule** | Global | Conversation session lifecycle management |
| **AIModule** | Global | AI provider orchestration and fallback |
| **GatewayModule** | Local | WebSocket event handling |
| **ToolsModule** | Global | Tool registration and execution |
| **StorageModule** | Global | Redis/In-memory storage abstraction |
| **RateLimitModule** | Global | Request rate limiting |

---

## Authentication System

### Token Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TOKEN ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ACCESS TOKEN (Short-lived)         REFRESH TOKEN (Long-lived) │
│   ┌─────────────────────────┐        ┌─────────────────────────┐│
│   │ {                       │        │ {                       ││
│   │   sub: "user-id",       │        │   sub: "user-id",       ││
│   │   email: "user@...",    │        │   tokenId: "uuid",      ││
│   │   iat: 1234567890,      │        │   iat: 1234567890,      ││
│   │   exp: +15 minutes      │        │   exp: +7 days          ││
│   │ }                       │        │ }                       ││
│   └─────────────────────────┘        └─────────────────────────┘│
│            │                                    │                │
│            │ Stateless                          │ Stored in      │
│            │ (verified locally)                 │ Redis/Memory   │
│            │                                    │ (revocable)    │
│            ▼                                    ▼                │
│   ┌─────────────────────────────────────────────────────────────┤
│   │              HORIZONTAL SCALING SUPPORT                     │
│   │  - Access tokens verified on ANY instance                   │
│   │  - Refresh tokens stored centrally in Redis                 │
│   │  - Token rotation on refresh                                │
│   └─────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
┌──────────┐                                              ┌──────────┐
│  Client  │                                              │  Server  │
└────┬─────┘                                              └────┬─────┘
     │                                                         │
     │  POST /auth/register {email, password}                  │
     │────────────────────────────────────────────────────────>│
     │                                                         │
     │  ┌─────────────────────────────────────────────────────┐│
     │  │ 1. Validate input (DTO)                             ││
     │  │ 2. Check email not registered                       ││
     │  │ 3. Hash password (bcrypt, 12 rounds)                ││
     │  │ 4. Create user in storage                           ││
     │  │ 5. Generate access + refresh tokens                 ││
     │  │ 6. Store refresh token (Redis/memory)               ││
     │  └─────────────────────────────────────────────────────┘│
     │                                                         │
     │<────────────────────────────────────────────────────────│
     │  {accessToken, refreshToken, expiresIn, user}           │
     │                                                         │
     │  GET /auth/me                                           │
     │  Authorization: Bearer <accessToken>                    │
     │────────────────────────────────────────────────────────>│
     │                                                         │
     │  ┌─────────────────────────────────────────────────────┐│
     │  │ 1. Extract token from header                        ││
     │  │ 2. Check token cache (LRU) - O(1)                   ││
     │  │ 3. If miss: Verify JWT, cache result                ││
     │  │ 4. Check user cache (LRU) - O(1)                    ││
     │  │ 5. If miss: Fetch from Redis, cache result          ││
     │  │ 6. Return user info                                 ││
     │  └─────────────────────────────────────────────────────┘│
     │                                                         │
     │<────────────────────────────────────────────────────────│
     │  {id, email, createdAt}                                 │
     │                                                         │
     │  POST /auth/refresh {refreshToken}                      │
     │────────────────────────────────────────────────────────>│
     │                                                         │
     │  ┌─────────────────────────────────────────────────────┐│
     │  │ 1. Verify refresh token JWT                         ││
     │  │ 2. Check token not revoked                          ││
     │  │ 3. Revoke old refresh token (rotation)              ││
     │  │ 4. Generate new token pair                          ││
     │  └─────────────────────────────────────────────────────┘│
     │                                                         │
     │<────────────────────────────────────────────────────────│
     │  {accessToken, refreshToken, expiresIn}                 │
     │                                                         │
```

### JWT Guard Behavior

| Context | Token Source | On Invalid |
|---------|--------------|------------|
| **HTTP** | `Authorization: Bearer <token>` | 401 Unauthorized |
| **WebSocket** | `handshake.auth.token` or query param | WsException |
| **Dev Mode** | Optional (bypass enabled) | Allow through |

---

## Auth Caching Layer

### Overview

The Auth Caching Layer provides in-memory LRU caching to reduce authentication latency by caching validated tokens and user profiles, avoiding repeated Redis/JWT lookups on every authenticated request.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTH CACHING LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Request with Bearer Token                                      │
│            │                                                     │
│            ▼                                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   Token Cache (LRU)                      │   │
│   │  ┌─────────────────────────────────────────────────┐    │   │
│   │  │  Key: SHA-256(token)                            │    │   │
│   │  │  Value: {userId, email}                         │    │   │
│   │  │  TTL: Min(token expiry, 5 minutes)              │    │   │
│   │  │  Max Size: 5000 entries                         │    │   │
│   │  └─────────────────────────────────────────────────┘    │   │
│   └────────────────────────┬────────────────────────────────┘   │
│                            │                                     │
│              ┌─────────────┴─────────────┐                      │
│              │                           │                      │
│         Cache HIT                   Cache MISS                  │
│         (~0.1ms)                    (verify JWT)                │
│              │                           │                      │
│              │                           ▼                      │
│              │                  ┌─────────────────┐             │
│              │                  │  JWT Verify +   │             │
│              │                  │  Cache Result   │             │
│              │                  └────────┬────────┘             │
│              │                           │                      │
│              └───────────────────────────┤                      │
│                                          │                      │
│                                          ▼                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    User Cache (LRU)                      │   │
│   │  ┌─────────────────────────────────────────────────┐    │   │
│   │  │  Key: userId or email                           │    │   │
│   │  │  Value: User object (without password)          │    │   │
│   │  │  TTL: 5 minutes                                 │    │   │
│   │  │  Max Size: 1000 entries                         │    │   │
│   │  └─────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Performance Gains

| Operation | Without Cache | With Cache (Hit) | Improvement |
|-----------|---------------|------------------|-------------|
| Token validation | ~1-2ms | ~0.1ms | 10-20x faster |
| User lookup | ~2-5ms (Redis) | ~0.1ms | 20-50x faster |
| Overall auth | ~5-10ms | ~0.5ms | 10-20x faster |

### LRU Cache Implementation

```typescript
class LRUCache<T> {
  constructor(maxSize: number, defaultTtlMs: number)

  get(key: string): T | undefined      // O(1) - moves to front
  set(key: string, value: T, ttlMs?: number): void  // O(1)
  delete(key: string): boolean         // O(1)
  has(key: string): boolean            // O(1)
  clear(): void                        // O(n)
  size(): number                       // O(1)
}
```

Features:
- **O(1) operations** using Map + doubly linked list
- **TTL per entry** with automatic expiration
- **LRU eviction** when max size reached
- **No external dependencies**

### Cache Invalidation

| Event | Action |
|-------|--------|
| User logout | Clear user's token cache entries |
| Password change | Clear user cache entry |
| Token expiry | Automatic TTL-based removal |
| Max size reached | LRU eviction (least recently used) |

### Configuration

```bash
# Auth Cache Configuration
AUTH_CACHE_ENABLED=true              # Enable/disable caching
AUTH_CACHE_USER_TTL_MS=300000        # User cache TTL (5 min)
AUTH_CACHE_USER_MAX_SIZE=1000        # Max cached users
AUTH_CACHE_TOKEN_TTL_MS=300000       # Token cache TTL (5 min)
AUTH_CACHE_TOKEN_MAX_SIZE=5000       # Max cached tokens
```

### Security Considerations

- **Token hash as cache key** - Raw tokens never stored as keys
- **No sensitive data cached** - Only IDs, emails, timestamps
- **Password never cached** - Only user metadata
- **TTL ensures freshness** - Stale data auto-expires
- **Logout clears cache** - Immediate invalidation on logout

---

## Session Management

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    SESSION LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌──────────────┐                                              │
│    │   CLIENT     │                                              │
│    │  CONNECTS    │                                              │
│    └──────┬───────┘                                              │
│           │                                                      │
│           ▼                                                      │
│    ┌──────────────┐      TTL: 15 min (configurable)             │
│    │   ACTIVE     │◄────────────────────────────────┐           │
│    │   SESSION    │                                  │           │
│    └──────┬───────┘                                  │           │
│           │                                          │           │
│    ┌──────┴──────┐                            (activity)        │
│    │             │                                  │           │
│    ▼             ▼                                  │           │
│ (timeout)   (disconnect)                            │           │
│    │             │                                  │           │
│    ▼             ▼                                  │           │
│ ┌──────┐   ┌────────────┐                          │           │
│ │EXPIRE│   │DISCONNECTED│     Grace: 5 min         │           │
│ │      │   │  (grace)   │◄─────────────────┐       │           │
│ └──┬───┘   └─────┬──────┘                  │       │           │
│    │             │                         │       │           │
│    │      ┌──────┴──────┐                  │       │           │
│    │      │             │                  │       │           │
│    │      ▼             ▼                  │       │           │
│    │  (timeout)    (reconnect)             │       │           │
│    │      │             │                  │       │           │
│    ▼      ▼             ▼                  │       │           │
│ ┌────────────┐   ┌──────────────┐          │       │           │
│ │  DESTROY   │   │   RESTORE    │──────────┴───────┘           │
│ │  SESSION   │   │   SESSION    │                               │
│ └────────────┘   │ (keep history)│                               │
│                  └──────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Session Data Structure

```typescript
interface Session {
  id: string;                      // Client ID
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  status: 'active' | 'disconnected';
  disconnectedAt?: Date;
  conversationHistory: Message[];  // Max 100 messages
  metadata?: Record<string, unknown>;
}
```

### Session Events

| Event | Trigger | Client Receives |
|-------|---------|-----------------|
| `SESSION_CREATED` | New connection | `{sessionId, expiresAt}` |
| `SESSION_RESTORED` | Reconnection | `{sessionId, history}` |
| `session_info` | Client request | `{status, messageCount, expiresAt}` |
| `conversation_history` | Client request | `Message[]` |

---

## AI Provider System

### Provider Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI PROVIDER SYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                      AIService                            │  │
│   │  ┌─────────────────────────────────────────────────────┐ │  │
│   │  │  • Provider registration                            │ │  │
│   │  │  • Provider selection (config-based)                │ │  │
│   │  │  • Automatic fallback to Mock                       │ │  │
│   │  │  • generateCompletion() / generateStream()          │ │  │
│   │  └─────────────────────────────────────────────────────┘ │  │
│   └────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         │                  │                  │                 │
│         ▼                  ▼                  ▼                 │
│   ┌───────────┐      ┌───────────┐      ┌───────────┐          │
│   │   Mock    │      │  OpenAI   │      │   Groq    │          │
│   │ Provider  │      │ Provider  │      │ Provider  │          │
│   ├───────────┤      ├───────────┤      ├───────────┤          │
│   │ Always    │      │ Requires  │      │ Free tier │          │
│   │ Available │      │ API Key   │      │ 30 req/min│          │
│   │           │      │           │      │           │          │
│   │ Simulated │      │ GPT-3.5   │      │ Llama 3.1 │          │
│   │ responses │      │ GPT-4     │      │ Mixtral   │          │
│   └───────────┘      └───────────┘      └───────────┘          │
│         ▲                                                       │
│         │                                                       │
│         └─────── FALLBACK (if configured provider unavailable) │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Provider Interface

```typescript
interface AIProvider {
  name: string;
  isAvailable: boolean;

  generateCompletion(
    messages: Message[],
    options?: AICompletionOptions
  ): Promise<AICompletionResult>;

  generateStream?(
    messages: Message[],
    options?: AICompletionOptions
  ): AsyncGenerator<AIStreamChunk>;
}
```

### Provider Configuration

| Provider | Env Variables | Default Model |
|----------|---------------|---------------|
| **Mock** | `AI_MOCK_RESPONSE_DELAY_MS` | N/A |
| **OpenAI** | `OPENAI_API_KEY`, `OPENAI_MODEL` | gpt-3.5-turbo |
| **Groq** | `GROQ_API_KEY`, `GROQ_MODEL` | llama-3.1-8b-instant |

---

## Tools System

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      TOOLS SYSTEM                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌────────────────────────────────────────────────────────┐    │
│   │                 ToolRegistryService                     │    │
│   │  ┌──────────────────────────────────────────────────┐  │    │
│   │  │  • Register tools with definitions + handlers    │  │    │
│   │  │  • Organize by category                          │  │    │
│   │  │  • Lookup tools by name                          │  │    │
│   │  │  • List available tools                          │  │    │
│   │  └──────────────────────────────────────────────────┘  │    │
│   └────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│   ┌────────────────────────────────────────────────────────┐    │
│   │                 ToolExecutorService                     │    │
│   │  ┌──────────────────────────────────────────────────┐  │    │
│   │  │  • Parameter validation                          │  │    │
│   │  │  • Timeout enforcement (30s default)             │  │    │
│   │  │  • Concurrency control (5 per session)           │  │    │
│   │  │  • Error handling & reporting                    │  │    │
│   │  │  • Execution metrics                             │  │    │
│   │  └──────────────────────────────────────────────────┘  │    │
│   └────────────────────────────────────────────────────────┘    │
│                                                                  │
│   Tool Categories:                                               │
│   ┌──────────┬──────────┬───────────────┬──────────┬────────┐  │
│   │ UTILITY  │   DATA   │ COMMUNICATION │  SYSTEM  │ CUSTOM │  │
│   └──────────┴──────────┴───────────────┴──────────┴────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tool Definition

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required?: string[];
  };
  category?: ToolCategory;
  timeout?: number;  // ms
}

type ToolHandler<TParams, TResult> = (
  params: TParams,
  context: ToolExecutionContext
) => Promise<TResult>;
```

### Tool Execution Flow

```
Client: call_tool {toolName, parameters, callId}
         │
         ▼
┌─────────────────────────────────────────┐
│ 1. Validate request format              │
│ 2. Lookup tool in registry              │
│ 3. Validate parameters against schema   │
│ 4. Check concurrency limits             │
│ 5. Execute with timeout                 │
│ 6. Return result with metrics           │
└─────────────────────────────────────────┘
         │
         ▼
Client: tool_result {callId, result, executionTimeMs}
```

---

## WebSocket Gateway

### Event Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEBSOCKET EVENTS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   CLIENT → SERVER (Subscribe)           SERVER → CLIENT (Emit)  │
│   ─────────────────────────            ─────────────────────    │
│                                                                  │
│   Message Flow:                                                  │
│   ├── user_message        ────────►    assistant_response       │
│   └── user_message_stream ────────►    stream_start             │
│                                        stream_chunk              │
│                                        stream_end                │
│                                                                  │
│   Session Management:                                            │
│   ├── get_history         ────────►    conversation_history     │
│   └── get_session_info    ────────►    session_info             │
│                                                                  │
│   Tool Operations:                                               │
│   ├── list_tools          ────────►    tools_list               │
│   ├── call_tool           ────────►    tool_result              │
│   └── get_tool_info       ────────►    tool_info                │
│                                                                  │
│   System Events:                                                 │
│   └── (connection)        ────────►    SESSION_CREATED          │
│                                        SESSION_RESTORED          │
│                                        rate_limit                │
│                                        error                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Response Format

```typescript
interface WsResponse<T> {
  data: T | null;
  code: string;           // MSG_SUCCESS, MSG_ERROR, etc.
  status: 'success' | 'error';
  description: string;
  timestamp: number;
}
```

---

## Storage Layer

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    STORAGE ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌────────────────────────────────────────────────────────┐    │
│   │                  RedisPoolService                       │    │
│   │  ┌──────────────────────────────────────────────────┐  │    │
│   │  │  • Singleton Redis connection pool               │  │    │
│   │  │  • Lazy connection with auto-retry              │  │    │
│   │  │  • Health checks and latency monitoring         │  │    │
│   │  │  • Graceful shutdown handling                   │  │    │
│   │  └──────────────────────────────────────────────────┘  │    │
│   └────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│   ┌────────────────────────────────────────────────────────┐    │
│   │                   StorageService                        │    │
│   │  ┌──────────────────────────────────────────────────┐  │    │
│   │  │  • Adapter selection (Redis > In-Memory)         │  │    │
│   │  │  • Automatic fallback on failure                 │  │    │
│   │  │  • Unified interface for all storage ops         │  │    │
│   │  └──────────────────────────────────────────────────┘  │    │
│   └────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│              ┌─────────────┴─────────────┐                      │
│              │                           │                      │
│              ▼                           ▼                      │
│   ┌───────────────────┐       ┌───────────────────┐            │
│   │  Redis Adapter    │       │ In-Memory Adapter │            │
│   ├───────────────────┤       ├───────────────────┤            │
│   │ • Persistent      │       │ • Ephemeral       │            │
│   │ • Horizontal scale│       │ • Single instance │            │
│   │ • TTL support     │       │ • Fast access     │            │
│   │ • Pub/Sub capable │       │ • No dependencies │            │
│   └───────────────────┘       └───────────────────┘            │
│              ▲                           ▲                      │
│              │                           │                      │
│              └───────── FALLBACK ────────┘                      │
│                    (on Redis failure)                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Redis Connection Pool

The `RedisPoolService` provides a shared Redis connection pool:

```typescript
interface RedisPoolService {
  getClient(): Redis | null;     // Get shared client
  isAvailable(): boolean;        // Check if connected
  isEnabled(): boolean;          // Check if enabled in config
  isHealthy(): Promise<boolean>; // Ping health check
  getLatency(): Promise<number>; // Latency in ms
  connect(): Promise<boolean>;   // Manual connect
  disconnect(): Promise<void>;   // Graceful shutdown
}
```

Features:
- **Singleton pattern** - One connection shared across all services
- **Lazy connection** - Connects only when enabled
- **Auto-retry** - Exponential backoff on connection failures
- **Health monitoring** - PING-based health checks
- **Event-driven** - Handles connect/disconnect/error events

### Key Patterns

| Data Type | Key Pattern | TTL |
|-----------|-------------|-----|
| Sessions | `talksy:session:{clientId}` | 15 min |
| Users | `talksy:user:{userId}` | Persistent |
| Email Index | `talksy:user:email:{email}` | Persistent |
| Refresh Tokens | `talksy:refresh:{tokenId}` | 7 days |

---

## Rate Limiting

### Sliding Window Algorithm

```
┌─────────────────────────────────────────────────────────────────┐
│                 SLIDING WINDOW RATE LIMITING                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Window: 60 seconds │ Max Requests: 10                          │
│                                                                  │
│   Time ───────────────────────────────────────────────────────► │
│                                                                  │
│   │◄──────────── 60 second window ──────────────►│              │
│                                                                  │
│   │  X  X     X  X  X     X  X     X  │  X  X     │              │
│   │  1  2     3  4  5     6  7     8  │  9  10    │              │
│   │                                   │           │              │
│   └───────────────────────────────────┴───────────┘              │
│                                       │                          │
│                                  Current Time                    │
│                                                                  │
│   Requests 1-8: Outside window (not counted)                    │
│   Requests 9-10: Inside window (counted)                        │
│   Remaining: 8 requests                                          │
│                                                                  │
│   If client exceeds limit:                                       │
│   ├── Return retryAfter (seconds until oldest expires)          │
│   ├── Emit 'rate_limit' event                                   │
│   └── Reject request with 429                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Rate Limit Response

```typescript
interface RateLimitResult {
  allowed: boolean;
  remaining: number;      // Requests left in window
  resetAt: number;        // Timestamp when limit resets
  retryAfter?: number;    // Seconds to wait (if limited)
}
```

---

## HTTP Infrastructure

### Middleware Pipeline

```
Request → LoggingMiddleware → Guards → Interceptors → Controller → Response
              │                                                       │
              └──────────────────────────────────────────────────────┘
                                    │
                              ExceptionFilter
                           (standardized errors)
```

### LoggingMiddleware

Comprehensive HTTP request logging with support for JSON and text formats:

```typescript
interface LogEntry {
  timestamp: string;      // ISO 8601 timestamp
  method: string;         // HTTP method
  url: string;            // Request URL
  statusCode: number;     // Response status
  responseTime: number;   // Duration in ms
  contentLength: number;  // Response size in bytes
  userAgent?: string;     // Client user agent
  ip?: string;            // Client IP address
  status: 'success' | 'error';
}
```

Configuration:
- `LOG_HTTP_REQUESTS=true` - Enable/disable logging
- `LOG_FORMAT=json|text` - Output format

### HttpExceptionFilter

Standardized error responses with security sanitization:

```typescript
interface ErrorResponse {
  data: null;
  code: ResponseCode;      // MSG_BAD_REQUEST, MSG_UNAUTHORIZED, etc.
  httpStatus: number;      // HTTP status code
  description: string;     // Sanitized error message
}
```

Features:
- **Standard response format** - Consistent error structure
- **Code mapping** - HTTP status → response code
- **Security** - Strips stack traces and paths in production
- **Validation errors** - Joins multiple messages

---

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
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
| GET | `/health/detailed` | Detailed component status |

---

## Data Flow Patterns

### Message Processing Flow

```
┌─────────┐     user_message      ┌─────────────┐
│ Client  │ ───────────────────► │   Gateway   │
└─────────┘                       └──────┬──────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
             ┌──────────┐         ┌──────────┐         ┌──────────┐
             │ Validate │         │   Rate   │         │ Session  │
             │ Message  │         │  Limit   │         │  Check   │
             └──────────┘         └──────────┘         └──────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │    Store     │
                                  │   Message    │
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  AIService   │
                                  │  Completion  │
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │    Store     │
                                  │   Response   │
                                  └──────┬───────┘
                                         │
                                         ▼
┌─────────┐   assistant_response  ┌─────────────┐
│ Client  │ ◄─────────────────── │   Gateway   │
└─────────┘                       └─────────────┘
```

### Token Validation Flow (with Caching)

```
Request with Bearer Token
         │
         ▼
┌─────────────────────────────────────────┐
│       Extract Token from Header         │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│     Check Token Cache (LRU)             │
│     Key: SHA-256(token)                 │
└─────────────────────────────────────────┘
         │
    ┌────┴────┐
    │         │
Cache HIT  Cache MISS
(~0.1ms)   │
    │      ▼
    │  ┌─────────────────────────────────────────┐
    │  │         Verify JWT Signature            │
    │  │      (using JWT_SECRET)                 │
    │  └─────────────────────────────────────────┘
    │      │
    │ ┌────┴────┐
    │ │         │
    │ Valid   Invalid
    │ │         │
    │ ▼         ▼
    │ ┌────────────────┐  ┌────────────────┐
    │ │ Cache Result   │  │ Throw 401      │
    │ │ (with TTL)     │  │ Unauthorized   │
    │ └───────┬────────┘  └────────────────┘
    │         │
    └────┬────┘
         │
         ▼
┌─────────────────────────────────────────┐
│     Check User Cache (LRU)              │
│     Key: userId                         │
└─────────────────────────────────────────┘
         │
    ┌────┴────┐
    │         │
Cache HIT  Cache MISS
(~0.1ms)   │
    │      ▼
    │  ┌─────────────────────────────────────────┐
    │  │     Fetch User from Redis/Storage       │
    │  │     Cache Result (with TTL)             │
    │  └─────────────────────────────────────────┘
    │         │
    └────┬────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         Attach User to Request          │
└─────────────────────────────────────────┘
```

---

## Configuration

### Environment Variables

```bash
# Core
NODE_ENV=development|production|test
PORT=3000
CORS_ORIGIN=*

# Authentication
AUTH_ENABLED=true
AUTH_BYPASS_IN_DEV=true
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=12

# Auth Cache (in-memory LRU)
AUTH_CACHE_ENABLED=true
AUTH_CACHE_USER_TTL_MS=300000
AUTH_CACHE_USER_MAX_SIZE=1000
AUTH_CACHE_TOKEN_TTL_MS=300000
AUTH_CACHE_TOKEN_MAX_SIZE=5000

# AI Providers
AI_PROVIDER=mock|openai|groq
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-3.5-turbo
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant

# Redis
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=talksy:

# Session
SESSION_TTL_MS=900000
SESSION_MAX_HISTORY=100
SESSION_DISCONNECT_GRACE_MS=300000

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10

# Logging
LOG_LEVEL=log
LOG_FORMAT=json
LOG_HTTP_REQUESTS=true
```

---

## Design Patterns

| Pattern | Usage |
|---------|-------|
| **Adapter** | Storage (Redis/Memory), AI Providers, WebSocket Adapter |
| **Provider** | AIService with pluggable providers |
| **Guard** | JwtAuthGuard, RateLimitGuard, ApiKeyGuard |
| **Interceptor** | ResponseInterceptor, WsLoggingInterceptor |
| **Factory** | Token generation, Session creation |
| **Observer** | EventEmitter for tool events |
| **Strategy** | Different AI/storage strategies |
| **Facade** | AIService, StorageService, CacheService |
| **Decorator** | @CurrentUser, NestJS decorators |
| **Singleton** | Global modules |
| **LRU Cache** | Token and user caching with O(1) operations |

---

## Testing Infrastructure

### Test Pyramid

```
┌─────────────────────────────────────────────────────────────────┐
│                    TESTING INFRASTRUCTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                        ┌───────────┐                            │
│                        │  K6 Load  │  ← Performance/Load        │
│                        │   Tests   │    (external)              │
│                        └─────┬─────┘                            │
│                    ┌─────────┴─────────┐                        │
│                    │  Latency Tests    │  ← Benchmarks          │
│                    │    (13 tests)     │    (Jest)              │
│                    └─────────┬─────────┘                        │
│              ┌───────────────┴───────────────┐                  │
│              │      E2E Tests (73 tests)     │  ← API Contract  │
│              │   (HTTP + WebSocket flows)    │    (Jest)        │
│              └───────────────┬───────────────┘                  │
│        ┌─────────────────────┴─────────────────────┐            │
│        │      Integration Tests (132 tests)        │  ← Module  │
│        │    (Service + Storage interactions)       │    (Jest)  │
│        └─────────────────────┬─────────────────────┘            │
│  ┌───────────────────────────┴───────────────────────────┐      │
│  │              Unit Tests (737 tests)                    │     │
│  │      (Business logic, utilities, edge cases)          │     │
│  └───────────────────────────────────────────────────────┘      │
│                                                                  │
│  Total: 955+ Jest Tests + K6 Scenarios                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Test Categories

| Category | Count | Focus |
|----------|-------|-------|
| **Unit Tests** | 737 | Business logic, utilities |
| **Integration Tests** | 132 | Service interactions |
| **E2E Tests** | 73 | API contracts, flows |
| **Latency Tests** | 13 | Performance benchmarks |
| **K6 Scenarios** | 6+ | Load testing, stress testing |

### K6 Load Test Scenarios

| Scenario | Description |
|----------|-------------|
| `all-endpoints-latency.js` | p95/p99 latency for all HTTP endpoints |
| `redis-cache-stress.js` | LRU cache under concurrent load |
| `websocket-connection.js` | Connection/disconnection stress |
| `message-flow.js` | Message throughput testing |
| `streaming-flow.js` | Streaming response performance |
| `rate-limit.js` | Rate limiter behavior under load |

### Test Commands

```bash
# Individual test tiers
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:e2e           # E2E tests
npm run test:latency       # Latency benchmarks

# Full test suites
npm run test:full:local    # Local (requires Redis)
npm run test:full:docker   # Docker (all infrastructure)

# K6 load tests
npm run k6:latency:smoke   # Quick latency check
npm run k6:cache:smoke     # Quick cache test
```

### Coverage Requirements

```json
{
  "branches": 90,
  "functions": 90,
  "lines": 90,
  "statements": 90
}
```

---

## Horizontal Scaling

### Multi-Instance Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   HORIZONTAL SCALING                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    ┌─────────────────┐                          │
│                    │  Load Balancer  │                          │
│                    └────────┬────────┘                          │
│                             │                                    │
│         ┌───────────────────┼───────────────────┐               │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│   ┌──────────┐        ┌──────────┐        ┌──────────┐         │
│   │ Instance │        │ Instance │        │ Instance │         │
│   │    1     │        │    2     │        │    N     │         │
│   │ ┌──────┐ │        │ ┌──────┐ │        │ ┌──────┐ │         │
│   │ │ LRU  │ │        │ │ LRU  │ │        │ │ LRU  │ │         │
│   │ │Cache │ │        │ │Cache │ │        │ │Cache │ │         │
│   │ └──────┘ │        │ └──────┘ │        │ └──────┘ │         │
│   └────┬─────┘        └────┬─────┘        └────┬─────┘         │
│        │                   │                   │                │
│        └───────────────────┼───────────────────┘                │
│                            │                                    │
│                            ▼                                    │
│              ┌─────────────────────────┐                       │
│              │     Redis Cluster       │                       │
│              ├─────────────────────────┤                       │
│              │ • Session Storage       │                       │
│              │ • User Data             │                       │
│              │ • Refresh Tokens        │                       │
│              │ • Socket.IO Pub/Sub     │                       │
│              └─────────────────────────┘                       │
│                                                                  │
│   Key Enablers:                                                 │
│   ✓ Stateless JWT access tokens (verify on any instance)       │
│   ✓ Per-instance LRU cache (reduced Redis roundtrips)          │
│   ✓ Redis-backed session storage (shared state)                │
│   ✓ Redis Socket.IO adapter (cross-instance messaging)         │
│   ✓ Centralized refresh token storage                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Scaling Checklist

- [x] Stateless JWT authentication
- [x] Redis session storage
- [x] Redis refresh token storage
- [x] Socket.IO Redis adapter
- [x] Graceful fallback to in-memory
- [x] In-memory LRU caching layer (auth optimization)
- [ ] Database clustering (if using persistent DB)

---

## Summary

Talksy is a production-ready, horizontally scalable real-time AI assistant backend featuring:

| Feature | Implementation |
|---------|----------------|
| **Authentication** | JWT with refresh token rotation |
| **Auth Caching** | In-memory LRU cache (10-20x faster auth) |
| **Real-time** | Socket.IO with Redis adapter |
| **AI Integration** | Pluggable providers (Mock, OpenAI, Groq) |
| **Session Management** | Lifecycle with reconnection support |
| **Rate Limiting** | Sliding window algorithm |
| **Storage** | Redis with automatic fallback |
| **Security** | bcrypt, CORS, input validation |
| **Observability** | Structured logging, health checks |
| **Testing** | 955+ tests (unit, integration, E2E, latency, K6) |

---

---

## DevOps Guide - Beginner to Advanced

> This section takes you from zero DevOps knowledge to confidently deploying and managing this application in production.

### Level 1: Beginner - Understanding the Basics

#### What is DevOps?

DevOps combines "Development" and "Operations". It's about getting your code from your laptop to users reliably.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THE DEVOPS JOURNEY                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   BEFORE DevOps:                                                             │
│   Developer: "Here's my code" → throws it over the wall → Ops team          │
│   Ops: "It doesn't work!" → blame game → slow releases → unhappy users      │
│                                                                              │
│   WITH DevOps:                                                               │
│   Developer + Ops = Same Team                                                │
│   Automated testing → Automated deployment → Fast, reliable releases        │
│                                                                              │
│   THE DEVOPS LIFECYCLE:                                                      │
│                                                                              │
│        ┌────────────────────────────────────────────────────────┐           │
│        │                                                        │           │
│        ▼                                                        │           │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    │           │
│   │  PLAN   │───►│  CODE   │───►│  BUILD  │───►│  TEST   │────┤           │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘    │           │
│        ▲                                                        │           │
│        │                                                        ▼           │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐              │
│   │ MONITOR │◄───│ OPERATE │◄───│ DEPLOY  │◄───│ RELEASE │              │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key DevOps Concepts

##### 1. Version Control (Git)

Git tracks changes to your code. GitHub/GitLab store it remotely.

```bash
# Basic Git workflow
git clone <repo>           # Download the project
git checkout -b feature    # Create a new branch
# ... make changes ...
git add .                  # Stage your changes
git commit -m "message"    # Save changes locally
git push origin feature    # Upload to remote
# Create Pull Request on GitHub → Code Review → Merge
```

**Branching Strategy (GitFlow simplified):**
```
main (production)  ────●─────────●─────────●────────► Stable releases
                       ↑         ↑         ↑
                       │         │         │
staging            ────●────●────●────●────●────────► Testing before release
                       ↑    ↑    ↑    ↑
                       │    │    │    │
feature branches   ────●    ●    ●    ●              Individual features
```

##### 2. Running the Application Locally

```bash
# Step 1: Clone the repository
git clone https://github.com/your-org/talksy.git
cd talksy

# Step 2: Install dependencies
npm install

# Step 3: Set up environment
cp .env.example .env
# Edit .env with your settings

# Step 4: Start development server
npm run start:dev

# The server is now running at http://localhost:3000
```

**Understanding npm scripts:**
```json
{
  "scripts": {
    "start": "node dist/main",           // Production start
    "start:dev": "nest start --watch",   // Development (auto-reload)
    "build": "nest build",               // Compile TypeScript
    "test": "jest",                       // Run tests
    "lint": "eslint src/"                 // Check code style
  }
}
```

##### 3. Environment Setup

**What you need installed:**
| Tool | Version | Purpose | Check Command |
|------|---------|---------|---------------|
| Node.js | 18+ | JavaScript runtime | `node --version` |
| npm | 9+ | Package manager | `npm --version` |
| Git | 2.x | Version control | `git --version` |
| Docker | 24+ | Containers (optional) | `docker --version` |

**Your first .env file:**
```bash
# Required for local development
NODE_ENV=development
PORT=3000

# Authentication
JWT_SECRET=any-secret-string-for-dev-only
AUTH_ENABLED=true
AUTH_BYPASS_IN_DEV=true    # Skip auth in development

# AI Provider (start with mock)
AI_PROVIDER=mock

# Redis (disable for simple local dev)
REDIS_ENABLED=false
```

##### 4. Testing Your Code

```bash
# Run different test levels
npm run test:unit          # Fast, run often
npm run test:integration   # Medium, run before commits
npm run test:e2e           # Slow, run before merging

# With coverage report
npm run test:cov

# Watch mode (re-runs on file changes)
npm run test:watch
```

**Understanding test output:**
```
 PASS  src/auth/auth.service.spec.ts
  AuthService
    ✓ should register a new user (45 ms)
    ✓ should login with valid credentials (38 ms)
    ✓ should reject invalid password (12 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Coverage:    92% statements
```

---

### Level 2: Intermediate - Docker and CI/CD

#### What is Docker?

Docker packages your app with everything it needs to run, so it works the same everywhere.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DOCKER EXPLAINED                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   WITHOUT DOCKER:                    WITH DOCKER:                           │
│   "Works on my machine!"             "Works EVERYWHERE!"                    │
│                                                                              │
│   Your laptop:                       Your laptop:                           │
│   - Node 18.2.0                      ┌─────────────────────────┐            │
│   - npm 9.6.4                        │      CONTAINER          │            │
│   - Linux                            │  ┌─────────────────┐    │            │
│                                      │  │ Node 18 (exact) │    │            │
│   Server:                            │  │ npm 9 (exact)   │    │            │
│   - Node 16.0.0 (different!)         │  │ All deps        │    │            │
│   - npm 8.0.0 (different!)           │  │ Your app code   │    │            │
│   - Windows (different!)             │  └─────────────────┘    │            │
│                                      └─────────────────────────┘            │
│   = PROBLEMS                                                                │
│                                      Same container runs on:                │
│                                      ✓ Your laptop                          │
│                                      ✓ CI/CD server                         │
│                                      ✓ Production server                    │
│                                      ✓ Your colleague's machine             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Docker Terminology

| Term | What It Is | Analogy |
|------|------------|---------|
| **Image** | A snapshot/template | A recipe |
| **Container** | Running instance of an image | A cooked meal |
| **Dockerfile** | Instructions to build an image | The recipe steps |
| **Docker Compose** | Run multiple containers together | A dinner menu |
| **Registry** | Where images are stored | A cookbook library |

#### Our Dockerfile Explained

```dockerfile
# ========================================
# DOCKERFILE BREAKDOWN
# ========================================

# Stage 1: Build stage
# Use Node.js 18 Alpine (small Linux) as base
FROM node:18-alpine AS builder

# Set working directory inside container
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install ALL dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# ----------------------------------------

# Stage 2: Production stage (smaller image)
FROM node:18-alpine AS production

WORKDIR /app

# Copy only what we need from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Remove dev dependencies
RUN npm prune --production

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
```

#### Docker Commands Cheat Sheet

```bash
# Build an image
docker build -t talksy:latest .

# Run a container
docker run -p 3000:3000 talksy:latest

# Run with environment variables
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-secret \
  talksy:latest

# See running containers
docker ps

# See container logs
docker logs <container-id>

# Stop a container
docker stop <container-id>

# Remove all stopped containers
docker container prune
```

#### Docker Compose for Local Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Our application
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - REDIS_ENABLED=true
      - REDIS_HOST=redis
    depends_on:
      - redis

  # Redis database
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop everything
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

#### CI/CD (Continuous Integration/Continuous Deployment)

CI/CD automatically tests and deploys your code when you push changes.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CI/CD PIPELINE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Developer pushes code                                                      │
│          │                                                                   │
│          ▼                                                                   │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │ CONTINUOUS INTEGRATION (CI) - Automatic checks                    │     │
│   │                                                                    │     │
│   │   1. Install dependencies    npm ci                               │     │
│   │   2. Lint code               npm run lint                         │     │
│   │   3. Run unit tests          npm run test:unit                    │     │
│   │   4. Run integration tests   npm run test:integration             │     │
│   │   5. Check coverage          npm run test:cov                     │     │
│   │   6. Build application       npm run build                        │     │
│   │                                                                    │     │
│   │   Any failure = ❌ Block merge                                     │     │
│   │   All pass = ✅ Ready to merge                                     │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│          │                                                                   │
│          ▼ (on merge to main)                                               │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │ CONTINUOUS DEPLOYMENT (CD) - Automatic release                    │     │
│   │                                                                    │     │
│   │   1. Build Docker image      docker build -t talksy .             │     │
│   │   2. Push to registry        docker push registry/talksy          │     │
│   │   3. Deploy to staging       kubectl apply (staging)              │     │
│   │   4. Run E2E tests           npm run test:e2e                     │     │
│   │   5. Deploy to production    kubectl apply (prod)                 │     │
│   │                                                                    │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### GitHub Actions Example

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm run test:unit

      - name: Integration tests
        run: npm run test:integration
        env:
          REDIS_ENABLED: true
          REDIS_HOST: localhost

      - name: Build
        run: npm run build
```

---

### Level 3: Advanced - Production Deployment

#### Infrastructure Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRODUCTION INFRASTRUCTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   INTERNET                                                                   │
│       │                                                                      │
│       ▼                                                                      │
│   ┌─────────────┐                                                           │
│   │     DNS     │  ← Domain: api.talksy.com → IP address                   │
│   │ (Cloudflare)│                                                           │
│   └──────┬──────┘                                                           │
│          │                                                                   │
│          ▼                                                                   │
│   ┌─────────────┐                                                           │
│   │     CDN     │  ← Cache static content, DDoS protection                 │
│   │ (Cloudflare)│     SSL/TLS termination                                  │
│   └──────┬──────┘                                                           │
│          │                                                                   │
│          ▼                                                                   │
│   ┌─────────────┐                                                           │
│   │    LOAD     │  ← Distribute traffic across servers                     │
│   │  BALANCER   │     Health checks, SSL termination                       │
│   │ (ALB/Nginx) │     WebSocket sticky sessions                            │
│   └──────┬──────┘                                                           │
│          │                                                                   │
│   ┌──────┴───────────────────────────────┐                                 │
│   │              │              │         │                                 │
│   ▼              ▼              ▼         ▼                                 │
│ ┌────┐        ┌────┐        ┌────┐    ┌────┐                              │
│ │Pod1│        │Pod2│        │Pod3│    │PodN│  ← Multiple app instances    │
│ │    │        │    │        │    │    │    │     Auto-scaling             │
│ └─┬──┘        └─┬──┘        └─┬──┘    └─┬──┘                              │
│   │             │             │         │                                   │
│   └─────────────┴─────────────┴─────────┘                                  │
│                       │                                                      │
│                       ▼                                                      │
│              ┌─────────────────┐                                            │
│              │  REDIS CLUSTER  │  ← Shared state (sessions, cache)         │
│              │  (ElastiCache)  │     High availability                     │
│              └─────────────────┘                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Kubernetes (K8s) Basics

Kubernetes orchestrates your containers at scale.

**Key Concepts:**
| Concept | What It Is | Analogy |
|---------|------------|---------|
| **Cluster** | Group of servers | A fleet of trucks |
| **Node** | Single server in cluster | One truck |
| **Pod** | One or more containers | A package on the truck |
| **Deployment** | Manages pod replicas | Delivery schedule |
| **Service** | Network endpoint for pods | Delivery address |
| **Ingress** | External access rules | Warehouse entrance |

**Example Kubernetes Deployment:**

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: talksy-backend
spec:
  replicas: 3                    # Run 3 instances
  selector:
    matchLabels:
      app: talksy
  template:
    metadata:
      labels:
        app: talksy
    spec:
      containers:
        - name: talksy
          image: registry/talksy:v1.0.0
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "256Mi"
              cpu: "200m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          env:
            - name: NODE_ENV
              value: "production"
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: talksy-secrets
                  key: jwt-secret
          readinessProbe:        # Is the app ready?
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:         # Is the app alive?
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: talksy-service
spec:
  selector:
    app: talksy
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: talksy-ingress
  annotations:
    nginx.ingress.kubernetes.io/websocket-services: "talksy-service"
spec:
  rules:
    - host: api.talksy.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: talksy-service
                port:
                  number: 80
```

#### Monitoring and Observability

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MONITORING STACK                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   THREE PILLARS OF OBSERVABILITY:                                           │
│                                                                              │
│   1. METRICS (Numbers over time)                                            │
│      ┌────────────────────────────────────────────────┐                    │
│      │  Prometheus + Grafana                          │                    │
│      │  • Request rate: 1000 req/sec                  │                    │
│      │  • Error rate: 0.1%                            │                    │
│      │  • Latency p95: 45ms                           │                    │
│      │  • CPU usage: 60%                              │                    │
│      │  • Memory: 400MB / 512MB                       │                    │
│      └────────────────────────────────────────────────┘                    │
│                                                                              │
│   2. LOGS (Event records)                                                    │
│      ┌────────────────────────────────────────────────┐                    │
│      │  ELK Stack (Elasticsearch, Logstash, Kibana)   │                    │
│      │  or Loki + Grafana                             │                    │
│      │                                                │                    │
│      │  {"timestamp":"2024-01-15T10:30:00Z",         │                    │
│      │   "level":"error",                            │                    │
│      │   "message":"Redis connection failed",        │                    │
│      │   "service":"talksy"}                         │                    │
│      └────────────────────────────────────────────────┘                    │
│                                                                              │
│   3. TRACES (Request journey)                                               │
│      ┌────────────────────────────────────────────────┐                    │
│      │  Jaeger or OpenTelemetry                       │                    │
│      │                                                │                    │
│      │  Request #abc123:                              │                    │
│      │  → Gateway (2ms)                               │                    │
│      │    → Auth check (5ms)                          │                    │
│      │      → Cache lookup (0.1ms) MISS               │                    │
│      │      → Redis lookup (3ms)                      │                    │
│      │    → AI Service (200ms)                        │                    │
│      │  Total: 210ms                                  │                    │
│      └────────────────────────────────────────────────┘                    │
│                                                                              │
│   ALERTING:                                                                  │
│   • Error rate > 1% for 5 min → PagerDuty alert                            │
│   • Latency p95 > 500ms → Slack notification                               │
│   • Pod restarts > 3 in 10 min → Incident created                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Security Best Practices

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRODUCTION SECURITY                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. SECRETS MANAGEMENT                                                      │
│      ✗ DON'T: Store in code or .env files                                   │
│      ✓ DO: Use secrets manager                                              │
│                                                                              │
│      Options:                                                               │
│      • AWS Secrets Manager / Parameter Store                                │
│      • HashiCorp Vault                                                      │
│      • Kubernetes Secrets (encrypted at rest)                               │
│                                                                              │
│   2. NETWORK SECURITY                                                        │
│      • Use HTTPS everywhere (TLS 1.3)                                       │
│      • Private subnets for databases                                        │
│      • Security groups / firewalls                                          │
│      • VPN for internal access                                              │
│                                                                              │
│   3. CONTAINER SECURITY                                                      │
│      • Use minimal base images (alpine)                                     │
│      • Don't run as root                                                    │
│      • Scan images for vulnerabilities (Trivy, Snyk)                        │
│      • Use read-only file systems                                           │
│                                                                              │
│   4. APPLICATION SECURITY                                                    │
│      ✓ Already implemented in Talksy:                                       │
│      • Input validation (class-validator)                                   │
│      • Password hashing (bcrypt, 12 rounds)                                 │
│      • JWT expiration (15 min access, 7 day refresh)                        │
│      • Rate limiting (10 req/min)                                           │
│      • CORS configuration                                                   │
│                                                                              │
│   5. SECURITY HEADERS                                                        │
│      app.use(helmet());  // Adds security headers                           │
│      • X-Content-Type-Options: nosniff                                      │
│      • X-Frame-Options: DENY                                                │
│      • Strict-Transport-Security                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Deployment Strategies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT STRATEGIES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. ROLLING UPDATE (Default, recommended to start)                         │
│      Replace instances one by one                                            │
│                                                                              │
│      Before: [v1] [v1] [v1]                                                 │
│      Step 1: [v2] [v1] [v1]                                                 │
│      Step 2: [v2] [v2] [v1]                                                 │
│      After:  [v2] [v2] [v2]                                                 │
│                                                                              │
│      ✓ Zero downtime                                                        │
│      ✓ Easy rollback                                                        │
│      ✗ Both versions run simultaneously                                      │
│                                                                              │
│   2. BLUE-GREEN                                                              │
│      Run two environments, switch traffic instantly                          │
│                                                                              │
│      [BLUE - v1] ◄── Traffic                                                │
│      [GREEN - v2] (idle, testing)                                           │
│                                                                              │
│      After switch:                                                           │
│      [BLUE - v1] (idle, ready for rollback)                                 │
│      [GREEN - v2] ◄── Traffic                                               │
│                                                                              │
│      ✓ Instant rollback                                                     │
│      ✓ No mixed versions                                                    │
│      ✗ Double resources during deploy                                       │
│                                                                              │
│   3. CANARY                                                                  │
│      Gradually shift traffic to new version                                  │
│                                                                              │
│      [v1] [v1] [v1] [v1]  ← 100% traffic                                    │
│      [v1] [v1] [v1] [v2]  ← 25% to v2                                       │
│      [v1] [v1] [v2] [v2]  ← 50% to v2                                       │
│      [v2] [v2] [v2] [v2]  ← 100% to v2                                      │
│                                                                              │
│      ✓ Minimize blast radius                                                │
│      ✓ Real user testing                                                    │
│      ✗ Complex traffic management                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Production Checklist

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRODUCTION READINESS CHECKLIST                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   INFRASTRUCTURE                                                             │
│   □ Multiple instances (min 2 for HA)                                       │
│   □ Load balancer configured                                                │
│   □ Auto-scaling rules set                                                  │
│   □ Redis cluster (not single instance)                                     │
│   □ Backup strategy for data                                                │
│                                                                              │
│   SECURITY                                                                   │
│   □ HTTPS only (redirect HTTP)                                              │
│   □ Secrets in secrets manager                                              │
│   □ Strong JWT_SECRET (256-bit random)                                      │
│   □ Rate limiting enabled                                                   │
│   □ CORS properly configured                                                │
│   □ Security headers (helmet)                                               │
│                                                                              │
│   MONITORING                                                                 │
│   □ Health check endpoints working                                          │
│   □ Metrics being collected                                                 │
│   □ Logs aggregated and searchable                                          │
│   □ Alerts configured for errors                                            │
│   □ On-call rotation set up                                                 │
│                                                                              │
│   RELIABILITY                                                                │
│   □ Graceful shutdown handling                                              │
│   □ Connection draining on deploy                                           │
│   □ Readiness/liveness probes                                               │
│   □ Circuit breakers for external services                                  │
│   □ Retry logic with backoff                                                │
│                                                                              │
│   PERFORMANCE                                                                │
│   □ Response time < 200ms p95                                               │
│   □ Resource limits set                                                     │
│   □ Connection pooling                                                      │
│   □ Caching layer working                                                   │
│   □ Load tested with K6                                                     │
│                                                                              │
│   DOCUMENTATION                                                              │
│   □ Runbook for common issues                                               │
│   □ Architecture documented                                                 │
│   □ API documentation                                                       │
│   □ Incident response plan                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Common DevOps Commands Reference

```bash
# ========================================
# DOCKER
# ========================================
docker build -t app:v1 .              # Build image
docker run -p 3000:3000 app:v1        # Run container
docker-compose up -d                   # Start services
docker-compose logs -f                 # Stream logs
docker-compose down                    # Stop services
docker system prune -a                 # Clean up everything

# ========================================
# KUBERNETES
# ========================================
kubectl get pods                       # List pods
kubectl get services                   # List services
kubectl logs pod-name                  # Pod logs
kubectl describe pod pod-name          # Pod details
kubectl apply -f deployment.yaml       # Deploy/update
kubectl rollout status deployment/app  # Check rollout
kubectl rollout undo deployment/app    # Rollback

# ========================================
# MONITORING
# ========================================
curl http://localhost:3000/health               # Health check
curl http://localhost:3000/health/detailed      # Detailed health
watch -n 1 'kubectl get pods'                   # Watch pods

# ========================================
# DEBUGGING
# ========================================
docker exec -it container-id sh        # Shell into container
kubectl exec -it pod-name -- sh        # Shell into pod
kubectl port-forward pod-name 3000:3000 # Port forward
```

### Learning Path Recommendations

**Beginner (Weeks 1-4):**
1. Master Git basics and branching
2. Learn to write and run tests
3. Understand environment variables
4. Run the app locally with Docker Compose

**Intermediate (Weeks 5-8):**
1. Write a Dockerfile from scratch
2. Set up a GitHub Actions pipeline
3. Deploy to a cloud VM (DigitalOcean, AWS EC2)
4. Configure Nginx as a reverse proxy

**Advanced (Weeks 9-12):**
1. Learn Kubernetes basics (Minikube locally)
2. Set up monitoring (Prometheus + Grafana)
3. Implement blue-green deployment
4. Practice incident response

**Resources:**
- Docker: https://docs.docker.com/get-started/
- Kubernetes: https://kubernetes.io/docs/tutorials/
- GitHub Actions: https://docs.github.com/en/actions
- 12-Factor App: https://12factor.net/

---

## Summary

Talksy is a production-ready, horizontally scalable real-time AI assistant backend featuring:

| Feature | Implementation |
|---------|----------------|
| **Authentication** | JWT with refresh token rotation |
| **Auth Caching** | In-memory LRU cache (10-20x faster auth) |
| **Real-time** | Socket.IO with Redis adapter |
| **AI Integration** | Pluggable providers (Mock, OpenAI, Groq) |
| **Session Management** | Lifecycle with reconnection support |
| **Rate Limiting** | Sliding window algorithm |
| **Storage** | Redis with automatic fallback |
| **Security** | bcrypt, CORS, input validation |
| **Observability** | Structured logging, health checks |
| **Testing** | 955+ tests (unit, integration, E2E, latency, K6) |

---

*Generated for Talksy Backend v0.0.1 - Updated with Auth Caching Layer and DevOps Guide*
