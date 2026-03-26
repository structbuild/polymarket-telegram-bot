# Struct SDK Skill

An agent skill for integrating [@structbuild/sdk](https://www.npmjs.com/package/@structbuild/sdk) - the TypeScript SDK for prediction market data via [api.struct.to](https://api.struct.to).

## Installation

```bash
npx skills add structbuild/struct-skill
```

## What This Skill Provides

This skill helps AI agents integrate the Struct SDK into your projects:

- **REST API integration** - Markets, events, traders, holders, series, search, tags, bonds, assets
- **Webhook management** - Create and manage webhooks for event notifications
- **Pagination helpers** - Iterate through large datasets
- **Error handling** - Typed errors for robust applications
- **TypeScript types** - Full type safety from OpenAPI spec

## Skill Contents

| File               | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `SKILL.md`         | Main skill file with quick start and common patterns  |
| `api-reference.md` | Complete method reference for all namespaces           |
| `webhooks.md`      | Webhook events, filters, payload format, and examples |
| `guides.md`        | Market screening, trader analytics, and more          |

## When the Agent Uses This Skill

The agent will automatically apply this skill when:

- Building apps that use prediction market data
- Integrating with Struct API or Polymarket
- Working with market/event/trader data

## Quick Example

```typescript
import { StructClient } from "@structbuild/sdk";

const client = new StructClient({ apiKey: process.env.STRUCT_API_KEY! });
const markets = await client.markets.getMarkets({ limit: 10 });
```

## License

MIT
