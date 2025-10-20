# Demo overview

This folder contains small, focused demos that showcase Normal’s core features: simple models, relations, transactions, and model extension.

## Blog
- Path: `demo/blog`
- Models: `Users`, `Posts`, `Tags`, `Comments`
- Highlights:
  - One‑to‑many: Users → Posts, Users → Comments, Posts → Comments
  - Many‑to‑many: Posts ↔ Tags via the synthetic join table `TagsPosts`
  - Model extension: see `demo/extend/Users.js` to add fields and getters (e.g. `profilePictureUrl`)
  - Active records: getters like `user.name` and relation proxies `post.tags.add/remove/load`
- Run:
  ```bash
  # from repo root
  node demo/index.js
  ```

## CRM
- Path: `demo/crm`
- Models: `Customer`, `Contact`, `Lead`, `Activity`, `Message`, `Quotation`, `QuotationLine`, `User`
- Highlights:
  - Multiple one‑to‑many flows typical of business apps
  - Date/datetime fields and booleans with defaults
  - Demonstrates how to model lifecycles (leads → customers, quotations → lines)

## Stocks
- Path: `demo/stocks`
- Models: `Warehouse`, `Product`, `Moves`, `Picking`, `Quant`, `Sale`, `SaleLine`
- Highlights:
  - Inventory flows across warehouses and pickings
  - One‑to‑many relations for lines and movements
  - Shows how defaults and basic integrity can be expressed in field specs

## Notes
- All demos run against an in‑memory SQLite database by default; no external DB required.
- Explore the models under each demo’s `models/` directory for concrete field definitions and relations.
- See `docs/FIELDS.md` for the full field spec and relation patterns.
