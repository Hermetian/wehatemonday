Directory structure of wehatemonday project, excluding auto-generated files like node_modules, .next, .vercel

wehatemonday
├── README.md
├── app
│   ├── api
│   │   ├── auth
│   │   │   └── route.ts
│   │   ├── test
│   │   │   ├── cleanup
│   │   │   │   └── route.ts
│   │   │   ├── tickets
│   │   │   │   └── route.ts
│   │   │   └── users
│   │   │       └── route.ts
│   │   └── trpc
│   │       └── [trpc]
│   │           └── route.ts
│   ├── auth
│   │   └── signin
│   │       └── page.tsx
│   ├── components
│   │   ├── auth
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── UserSettings.tsx
│   │   ├── common
│   │   │   ├── Navigation.tsx
│   │   │   ├── SortableItem.tsx
│   │   │   └── Terminal.tsx
│   │   ├── teams
│   │   │   ├── CreateTeamForm.tsx
│   │   │   └── TeamManagement.tsx
│   │   ├── tickets
│   │   │   ├── CreateTicketForm.tsx
│   │   │   ├── TicketDialog.tsx
│   │   │   ├── TicketList.tsx
│   │   │   └── TicketMessages.tsx
│   │   └── ui
│   │       ├── alert-dialog.tsx
│   │       ├── alert.tsx
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── checkbox.tsx
│   │       ├── dialog.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── rich-text-editor.tsx
│   │       ├── select.tsx
│   │       ├── status-badge.tsx
│   │       ├── textarea.tsx
│   │       ├── toggle.tsx
│   │       └── tooltip.tsx
│   ├── contexts
│   ├── favicon.ico
│   ├── globals.css
│   ├── homepage
│   │   └── page.tsx
│   ├── layout.tsx
│   ├── lib
│   │   ├── auth
│   │   │   ├── AuthContext.tsx
│   │   │   └── supabase.ts
│   │   ├── trpc
│   │   │   ├── client.ts
│   │   │   ├── context.ts
│   │   │   ├── routers
│   │   │   │   ├── _app.ts
│   │   │   │   ├── message.ts
│   │   │   │   ├── team.ts
│   │   │   │   ├── ticket.ts
│   │   │   │   └── user.ts
│   │   │   └── trpc.ts
│   │   └── utils
│   │       ├── audit-logger.ts
│   │       ├── cache-helpers.ts
│   │       ├── cache.ts
│   │       ├── common.ts
│   │       ├── test-data-cleanup.ts
│   │       ├── test-data-generator.ts
│   │       └── test-ticket-generator.ts
│   ├── page.tsx
│   ├── prisma.ts
│   ├── providers.tsx
│   ├── teams
│   │   └── page.tsx
│   ├── tickets
│   │   └── create
│   │       └── page.tsx
│   └── types
│       └── tickets.ts
├── components
├── components.json
├── eslint.config.mjs
├── filestructure.md
├── lib
│   ├── trpc
│   │   └── routers
│   └── utils.ts
├── middleware.ts
├── next-env.d.ts
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── prisma
│   ├── migrations
│   │   ├── 0_init
│   │   │   ├── migration.sql
│   │   │   └── migration.toml
│   │   ├── 20250125202432_add_last_updated_by
│   │   │   └── migration.sql
│   │   ├── 20250125205118_make_last_updated_by_optional
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   └── schema.prisma
├── public
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── tailwind.config.ts
├── terminal
├── tsconfig.json
├── tsconfig.tsbuildinfo
└── wehatemonday.code-workspace

##run tree -I 'node_modules|.next|.vercel' and copy/paste the output above