Directory structure of wehatemonday project, excluding auto-generated files like node_modules, .next, .vercel

wehatemonday
.
├── README.md
├── app
│   ├── api
│   │   ├── test
│   │   │   ├── cleanup
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
│   │   ├── marketplace
│   │   │   └── MarketplaceDialog.tsx
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
│   ├── favicon.ico
│   ├── globals.css
│   ├── homepage
│   │   └── page.tsx
│   ├── layout.tsx
│   ├── lib
│   │   ├── auth
│   │   │   ├── AuthContext.tsx
│   │   │   └── supabase.ts
│   │   ├── services
│   │   │   └── langsmith.ts
│   │   ├── trpc
│   │   │   ├── client.ts
│   │   │   ├── context.ts
│   │   │   ├── routers
│   │   │   │   ├── _app.ts
│   │   │   │   ├── marketplace.ts
│   │   │   │   ├── message.ts
│   │   │   │   ├── team.ts
│   │   │   │   ├── ticket.ts
│   │   │   │   └── user.ts
│   │   │   ├── transformer.ts
│   │   │   └── trpc.ts
│   │   └── utils
│   │       ├── audit-logger.ts
│   │       ├── cache-helpers.ts
│   │       ├── cache.ts
│   │       ├── common.ts
│   │       ├── rls-monitor.ts
│   │       ├── test-data-cleanup.ts
│   │       ├── test-data-generator.ts
│   │       └── test-ticket-generator.ts
│   ├── page.tsx
│   ├── providers.tsx
│   ├── teams
│   │   └── page.tsx
│   ├── tickets
│   │   └── create
│   │       └── page.tsx
│   └── types
│       ├── auth.ts
│       ├── marketplace.ts
│       └── tickets.ts
├── components
├── components.json
├── data_model.md
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
├── public
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── schema.sql
├── supabase
│   ├── config.toml
│   ├── functions
│   │   ├── cleanup-expired-test-data
│   │   │   ├── deno.json
│   │   │   ├── import_map.json
│   │   │   └── index.ts
│   │   ├── schedule_cleanup.sql
│   │   └── sync_role.sql
│   ├── migrations
│   │   ├── 20250126213255_create_user_role_enum.sql
│   │   ├── 20250128210909_add_created_by_to_messages.sql
│   │   ├── 20250129155900_add_rls_only.sql
│   │   ├── 20250129160920_add_users_rls.sql
│   │   ├── 20250129161930_grant_service_role.sql
│   │   ├── 20250129163600_add_users_rls.sql
│   │   ├── 20250129174000_add_rls_monitoring.sql
│   │   ├── 20250129174100_enable_pg_cron.sql
│   │   ├── 20250129194600_add_marketplace_conversations.sql
│   │   ├── 20250129200000_add_langsmith_config.sql
│   │   └── dashboard_migration.sql
│   └── tests
│       └── rls_test.sql
├── tailwind.config.ts
├── terminal
├── tsconfig.json
├── tsconfig.tsbuildinfo
└── wehatemonday.code-workspace

##tree -I 'node_modules|.next|.vercel' 
##Run this command and copy/paste the output above
