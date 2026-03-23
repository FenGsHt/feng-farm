# Farm Game Architecture

## System Overview

```
┌─────────────────┐      HTTP POST       ┌─────────────────┐
│                 │ ──────────────────►  │                 │
│   Browser       │                      │   Express.js    │
│   (Client)      │  ◄──────────────────  │   Server        │
│                 │     JSON Response    │   (Port 3000)   │
└─────────────────┘                      └────────┬────────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
                                        │   JSON Files    │
                                        │  - game_data.json
                                        │  - operation_logs.json
                                        └─────────────────┘
```

## Components

### Client Layer (`/client`)

| File | Purpose |
|------|---------|
| `index.html` | Game UI with 20-plot grid, tool buttons, message log |
| `game.js` | Game logic, API communication, audio/particle systems |
| `styles.css` | Visual styling with CSS animations |

**Key Classes:**
- `GameAPI` - Handles all HTTP requests to server
- `SoundManager` - Web Audio API for sound effects
- `ParticleSystem` - Visual feedback animations

### Server Layer (`/server`)

| File | Purpose |
|------|---------|
| `server.js` | Express server with API endpoints, anti-cheat logic |
| `game_data.json` | Persistent player data (coins, plots) |
| `operation_logs.json` | Audit log of all player actions |

### Data Models

**Player Data:**
```json
{
    "players": {
        "农民": {
            "coins": 100,
            "playerName": "农民",
            "plots": [...],
            "lastSaved": 1739452800000
        }
    }
}
```

**Plot State:**
```json
{
    "planted": false,
    "watered": false,
    "growthTime": 0,
    "cropType": null
}
```

## Security Features

1. **Rate Limiting** - 500ms cooldown between same-type actions
2. **Server-Side Validation** - All game logic validated on server
3. **Timestamp Verification** - Growth time checked server-side

## Data Flow

```
User Click → Client Validate → Server Validate → 
Update State → Log Action → Save to Disk → Respond → Update UI
```

## Future Considerations

- Replace JSON files with SQLite for better concurrent handling
- Add WebSocket support for real-time multiplayer
- Implement JWT authentication
- Add Redis for session management