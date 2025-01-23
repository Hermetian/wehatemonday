##This is a description of the current file structure for the project

##Update this when adding new files or removing files
├── README.md
├── app
│   ├── api
│   │   └── trpc
│   │       └── [trpc]
│   │           └── route.ts
│   ├── auth
│   │   └── signin
│   │       └── page.tsx
│   ├── components
│   │   ├── tickets
│   │   │   ├── CreateTicketForm.tsx
│   │   │   ├── TicketDialog.tsx
│   │   │   ├── TicketList.tsx
│   │   │   └── TicketMessages.tsx
│   │   ├── auth
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── UserSettings.tsx
│   │   ├── common
│   │   │   ├── Terminal.tsx
│   │   │   └── SortableItem.tsx
│   │   └── ui
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── checkbox.tsx
│   │       ├── dialog.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── select.tsx
│   │       └── textarea.tsx
│   ├── homepage
│   │   └── page.tsx
│   ├── lib
│   │   ├── auth
│   │   │   ├── AuthContext.tsx
│   │   │   └── supabase.ts
│   │   ├── db
│   │   │   └── prisma.ts
│   │   ├── trpc
│   │   │   ├── client.ts
│   │   │   ├── context.ts
│   │   │   └── routers
│   │   │       ├── _app.ts
│   │   │       ├── message.ts
│   │   │       ├── ticket.ts
│   │   │       └── user.ts
│   │   └── utils
│   │       ├── audit-logger.ts
│   │       └── common.ts
│   ├── tickets
│   │   └── create
│   │       └── page.tsx
│   ├── types
│   │   └── tickets.ts
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   └── providers.tsx
├── components.json
├── eslint.config.mjs
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── prisma
│   ├── migrations
│   │   ├── 20250121024911_updating_by_prisma_1
│   │   │   └── migration.sql
│   │   ├── 20250122041244_add_audit_logs
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   └── schema.prisma
├── public
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── tailwind.config.ts
├── tsconfig.json
└── wehatemonday.code-workspace