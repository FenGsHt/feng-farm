# Farm Game API Documentation

## Overview

The Farm Game uses a **RESTful HTTP API** for client-server communication. All requests are sent via `POST` (except for admin endpoints) and return JSON responses.

**Base URL:** `http://localhost:3000/api`

---

## Connection

### Server Endpoint

```javascript
// The client automatically appends the player name to every request
const API_BASE = '/api';
```

### Making Requests

All API calls include the player's name in the request body:

```javascript
fetch('/api/endpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        ...data,
        playerName: gameState.playerName
    })
})
```

---

## Message Format

### Client → Server

All requests use the following format:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `playerName` | string | Yes | Player's display name |
| `*` | any | No | Additional endpoint-specific fields |

### Server → Client

All responses follow this structure:

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the operation succeeded |
| `message` | string | Optional human-readable message |
| `data` | object | Response data (endpoint-specific) |

---

## API Endpoints

### 1. Load Player Data

**Endpoint:** `POST /api/load`

**Purpose:** Retrieve existing player data or create new player profile.

**Request Body:**
```json
{
    "playerName": "农民"
}
```

**Response (Existing Player):**
```json
{
    "coins": 100,
    "playerName": "农民",
    "plots": [
        { "planted": false, "watered": false, "growthTime": 0, "cropType": null },
        ...
    ],
    "lastSaved": 1739452800000
}
```

**Response (New Player):**
```json
{
    "coins": 100,
    "playerName": "农民",
    "plots": [
        { "planted": false, "watered": false, "growthTime": 0, "cropType": null },
        ... (20 plots total)
    ]
}
```

---

### 2. Save Player Data

**Endpoint:** `POST /api/save`

**Purpose:** Persist player state to server.

**Request Body:**
```json
{
    "playerName": "农民",
    "coins": 100,
    "plots": [
        { "planted": true, "watered": true, "growthTime": 1739452800000, "cropType": null },
        ...
    ]
}
```

**Response:**
```json
{
    "success": true,
    "message": "数据保存成功"
}
```

---

### 3. Log Operation

**Endpoint:** `POST /api/log`

**Purpose:** Record player actions for audit/debugging.

**Request Body:**
```json
{
    "playerName": "农民",
    "action": "plant",
    "plotIndex": 5,
    "timestamp": 1739452800000
}
```

**Response:**
```json
{
    "success": true
}
```

---

### 4. Validate Action (Anti-Cheat)

**Endpoint:** `POST /api/validate`

**Purpose:** Server-side validation to prevent cheating. Checks rate limits and game logic.

**Request Body:**
```json
{
    "playerName": "农民",
    "action": "plant",
    "plotIndex": 5,
    "plotState": {
        "planted": false,
        "watered": false,
        "growthTime": 0,
        "cropType": null
    }
}
```

**Response (Valid):**
```json
{
    "valid": true
}
```

**Response (Invalid):**
```json
{
    "valid": false,
    "message": "金币不足"
}
```

---

### 5. Get Logs (Admin)

**Endpoint:** `GET /api/logs`

**Purpose:** Retrieve operation logs (for debugging/admin purposes).

**Response:**
```json
{
    "logs": [
        {
            "playerName": "农民",
            "action": "plant",
            "plotIndex": 5,
            "details": { "timestamp": 1739452800000 },
            "timestamp": 1739452800000,
            "ip": "unknown"
        },
        ...
    ]
}
```

---

## Event Types

The game uses the following action types:

| Event | Description | Parameters |
|-------|-------------|------------|
| `plant` | Plant a crop in a plot | `plotIndex` (0-19), costs 10 coins |
| `water` | Water a planted crop | `plotIndex` (0-19), speeds up growth by 50% |
| `harvest` | Harvest a fully grown crop | `plotIndex` (0-19), rewards 25 coins (37.5 if watered) |

### Plot States

Each plot can have the following states:

| Field | Type | Description |
|-------|------|-------------|
| `planted` | boolean | Whether a crop is planted |
| `watered` | boolean | Whether the crop has been watered today |
| `growthTime` | number | Timestamp when crop was planted |
| `cropType` | string | Type of crop (currently always null) |

---

## Error Codes

### Validation Errors

| Code | Message | Description |
|------|---------|-------------|
| V001 | 操作过于频繁，请稍后再试 | Rate limit exceeded |
| V002 | 无效的格子位置 | Invalid plot index (outside 0-19) |
| V003 | 该格子已有作物 | Plot already has a crop |
| V004 | 金币不足 | Insufficient coins |
| V005 | 没有可浇水的作物 | No crop to water |
| V006 | 已经浇过水了 | Already watered today |
| V007 | 作物未成熟 | Crop not fully grown |

### Network Errors

| Code | Message | Description |
|------|---------|-------------|
| N001 | 网络错误 | Network connectivity issue |

---

## Game Configuration

These values are hardcoded on the client:

| Constant | Value | Description |
|----------|-------|-------------|
| `GRID_SIZE` | 20 | Number of farm plots |
| `PLANT_COST` | 10 | Coins to plant a crop |
| `HARVEST_REWARD` | 25 | Base coins from harvest |
| `GROWTH_TIME` | 5000 | Milliseconds for full growth (5 seconds) |
| `WATER_BONUS` | 1.5 | Growth multiplier when watered |

---

## Example: Complete Game Flow

```javascript
// 1. Load player data
const playerData = await fetch('/api/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName: 'FarmerJohn' })
}).then(r => r.json());

// 2. Validate and perform action
const validation = await fetch('/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        playerName: 'FarmerJohn',
        action: 'plant',
        plotIndex: 0,
        plotState: playerData.plots[0]
    })
}).then(r => r.json());

if (validation.valid) {
    // 3. Update local state and re-render
    gameState.plots[0].planted = true;
    gameState.coins -= 10;
    
    // 4. Log the action
    await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            playerName: 'FarmerJohn',
            action: 'plant',
            plotIndex: 0,
            timestamp: Date.now()
        })
    });
    
    // 5. Save updated state
    await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            playerName: 'FarmerJohn',
            coins: gameState.coins,
            plots: gameState.plots
        })
    });
}
```

---

## Notes

- The server performs all validation server-side to prevent cheating
- Rate limiting: 500ms cooldown between same-type actions
- Auto-save occurs every 30 seconds on the client
- All timestamps are Unix milliseconds (Date.now())