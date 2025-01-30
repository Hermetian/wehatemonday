# Role-Based Access Control Model

## User Roles
We have four distinct roles in the system, in descending order of default privilege:
- ADMIN
- MANAGER
- AGENT
- CUSTOMER

## Databases
users
tickets
messages
teams
team_members
audit_logs


**Database Schema**:
                                     Table "public.users"
    Column     |           Type           | Collation | Nullable |          Default           
---------------+--------------------------+-----------+----------+----------------------------
 id            | uuid                     |           | not null | uuid_generate_v4()
 email         | text                     |           | not null | 
 name          | text                     |           |          | 
 role          | user_role_enum           |           | not null | 'CUSTOMER'::user_role_enum
 created_at    | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 updated_at    | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 cleanup_at    | timestamp with time zone |           |          | 
 metadata      | jsonb                    |           |          | 
 test_batch_id | text                     |           |          | 
Indexes:
    "users_pkey" PRIMARY KEY, btree (id)
    "idx_users_clade" btree (role)
    "users_email_test_batch_id_key" UNIQUE CONSTRAINT, btree (email, test_batch_id)
    "users_role_idx" btree (role)
Referenced by:
    TABLE "audit_logs" CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id)
    TABLE "team_members" CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    TABLE "tickets" CONSTRAINT "tickets_assigned_to_id_fkey" FOREIGN KEY (assigned_to_id) REFERENCES users(id)
    TABLE "tickets" CONSTRAINT "tickets_created_by_id_fkey" FOREIGN KEY (created_by_id) REFERENCES users(id)
    TABLE "tickets" CONSTRAINT "tickets_last_updated_by_id_fkey" FOREIGN KEY (last_updated_by_id) REFERENCES users(id)
Triggers:
    sync_role_trigger AFTER UPDATE OF role ON users FOR EACH ROW WHEN (old.role IS DISTINCT FROM new.role) EXECUTE FUNCTION sync_role()


                                     Table "public.tickets"
       Column       |           Type           | Collation | Nullable |         Default         
--------------------+--------------------------+-----------+----------+-------------------------
 id                 | text                     |           | not null | gen_random_uuid()::text
 title              | text                     |           | not null | 
 description        | text                     |           | not null | 
 status             | text                     |           | not null | 'OPEN'::text
 priority           | text                     |           | not null | 'MEDIUM'::text
 customer_id        | uuid                     |           | not null | 
 assigned_to_id     | uuid                     |           |          | 
 created_by_id      | uuid                     |           | not null | 
 tags               | text[]                   |           |          | 
 created_at         | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 updated_at         | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 cleanup_at         | timestamp with time zone |           |          | 
 test_batch_id      | text                     |           |          | 
 metadata           | jsonb                    |           |          | '{}'::jsonb
 description_html   | text                     |           | not null | ''::text
 last_updated_by_id | uuid                     |           |          | 
Indexes:
    "tickets_pkey" PRIMARY KEY, btree (id)
    "idx_tickets_assigned_to_id" btree (assigned_to_id)
    "idx_tickets_created_by_id" btree (created_by_id)
    "idx_tickets_customer_id" btree (customer_id)
    "idx_tickets_priority" btree (priority)
    "idx_tickets_status" btree (status)
    "idx_tickets_tags" gin (tags)
    "idx_tickets_test_batch_id" btree (test_batch_id)
    "idx_tickets_updated_at" btree (updated_at)
Foreign-key constraints:
    "tickets_assigned_to_id_fkey" FOREIGN KEY (assigned_to_id) REFERENCES users(id)
    "tickets_created_by_id_fkey" FOREIGN KEY (created_by_id) REFERENCES users(id)
    "tickets_last_updated_by_id_fkey" FOREIGN KEY (last_updated_by_id) REFERENCES users(id)
Referenced by:
    TABLE "messages" CONSTRAINT "messages_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE

                                     Table "public.messages"
    Column     |           Type           | Collation | Nullable |         Default         
--------------+--------------------------+-----------+----------+-------------------------
 id           | text                     |           | not null | gen_random_uuid()::text
 content      | text                     |           | not null | 
 ticket_id    | text                     |           | not null | 
 is_internal  | boolean                  |           | not null | false
 created_at   | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 updated_at   | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 content_html | text                     |           | not null | ''::text
 created_by_id| uuid                     |           |          | 
Indexes:
    "messages_pkey" PRIMARY KEY, btree (id)
    "idx_messages_is_internal" btree (is_internal)
    "idx_messages_ticket_id" btree (ticket_id)
    "idx_messages_created_by" btree (created_by_id)
Foreign-key constraints:
    "messages_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    "fk_messages_created_by" FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE

                                  Table "public.teams"
   Column   |           Type           | Collation | Nullable |         Default         
------------+--------------------------+-----------+----------+-------------------------
 id         | text                     |           | not null | gen_random_uuid()::text
 name       | text                     |           | not null | 
 created_at | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 updated_at | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 tags       | text[]                   |           |          | 
Indexes:
    "teams_pkey" PRIMARY KEY, btree (id)
    "idx_teams_name" btree (name)
Referenced by:
    TABLE "team_members" CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE

           Table "public.team_members"
 Column  | Type | Collation | Nullable | Default 
---------+------+-----------+----------+---------
 team_id | text |           | not null | 
 user_id | uuid |           | not null | 
Indexes:
    "team_members_pkey" PRIMARY KEY, btree (team_id, user_id)
Foreign-key constraints:
    "team_members_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    "team_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

                               Table "public.audit_logs"
  Column   |           Type           | Collation | Nullable |         Default         
-----------+--------------------------+-----------+----------+-------------------------
 id        | text                     |           | not null | gen_random_uuid()::text
 action    | text                     |           | not null | 
 entity    | text                     |           | not null | 
 entity_id | text                     |           | not null | 
 user_id   | uuid                     |           | not null | 
 old_data  | jsonb                    |           |          | 
 new_data  | jsonb                    |           | not null | 
 timestamp | timestamp with time zone |           |          | CURRENT_TIMESTAMP
Indexes:
    "audit_logs_pkey" PRIMARY KEY, btree (id)
    "idx_audit_logs_entity" btree (entity, entity_id)
    "idx_audit_logs_timestamp" btree ("timestamp")
    "idx_audit_logs_user_id" btree (user_id)
Foreign-key constraints:
    "audit_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id)


> **Important Testing Note**: This system is designed for demonstration purposes. All users can modify their own data, including role elevation, to facilitate testing of all features. This is intentionally permissive for demonstration purposes.

## Access Patterns by Entity: TODO

### Users
- **ADMIN**
  - Full CRUD access to all users
  - Can modify roles of other users
  - Can view and modify all user metadata
  
- **MANAGER**
  - Full CRUD access to all users
  - Can modify roles of other users
  - Can view and modify all user metadata
  
- **AGENT**
  - Can view other users' basic information
  - Can view CUSTOMER details
  - Can modify their own user data
  
- **CUSTOMER**
  - Can view their own profile
  - Can view basic info of assigned AGENTS
  - Can modify their own user data

### Teams
- **ADMIN**
  - Full CRUD access to all teams
  - Can manage team memberships
  - Can set and modify team tags
  
- **MANAGER**
  - Full CRUD access to all teams
  - Can manage team memberships
  - Can set and modify team tags
  
- **AGENT**
  - Can view teams they belong to
  - Can view team member information
  - Cannot modify team structure
  
- **CUSTOMER**
  - Can view teams they're assigned to
  - Cannot modify team data

### Tickets
- **ADMIN**
  - Full CRUD access to all tickets
  - Can assign tickets to any agent
  - Can modify all ticket fields
  
- **MANAGER**
  - Full CRUD access to all tickets
  - Can assign tickets to any agent
  - Can modify all ticket fields
  
- **AGENT**
  - Can create and update tickets
  - Can view tickets assigned to them
  - Can view tickets for their teams
  - Can update ticket status and add messages
  - Cannot delete tickets
  
- **CUSTOMER**
  - Can create tickets
  - Can view their own tickets
  - Can add messages to their tickets
  - Can modify status and priority of their own tickets

### Messages
- **ADMIN**
  - Full access to all messages
  - Can create internal and external messages
  - Can delete messages
  
- **MANAGER**
  - Can view all messages
  - Can create internal and external messages
  - Cannot delete messages
  
- **AGENT**
  - Can view messages on assigned tickets
  - Can create internal and external messages
  - Cannot delete messages
  
- **CUSTOMER**
  - Can view external messages on their tickets
  - Cannot view internal messages
  - Can create external messages
  - Cannot delete messages

### Audit Logs
- **ADMIN, MANAGER, AGENT**
  - Full read access to all audit logs
  
- **CUSTOMER**
  - No access to audit logs

## Special Considerations

### Test Data Handling
- `testBatchId` is used for populating test data for demonstration purposes
- No data isolation is implemented - this allows testers to view all data
- Test data should be clearly marked with `testBatchId` for identification

### Metadata Access
- `metadata` and `descriptionHtml` fields follow the same access patterns as their parent entities
- Only ADMIN and MANAGER roles should be able to modify metadata

### Automated Cleanup Implementation
The `cleanupAt` field should be implemented using Supabase Edge Functions with a scheduled cron trigger:

1. Create an Edge Function that:
   - Queries for records where cleanupAt < current_timestamp
   - Performs cascading deletion of related records
   - Logs cleanup operations to audit logs

2. Set up a Supabase scheduled function:
   ```sql
   select cron.schedule(
     'cleanup-job',
     '0 */4 * * *',  -- Run every 4 hours
     'cleanup_expired_records_function'
   );
   ```

This approach provides:
- Serverless execution
- Automatic retry on failure
- Built-in logging
- No additional infrastructure requirements