

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";








ALTER SCHEMA "public" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."UserRole" AS ENUM (
    'ADMIN',
    'MANAGER',
    'AGENT',
    'CUSTOMER'
);


ALTER TYPE "public"."UserRole" OWNER TO "postgres";


CREATE TYPE "public"."user_role_enum" AS ENUM (
    'ADMIN',
    'MANAGER',
    'AGENT',
    'CUSTOMER'
);


ALTER TYPE "public"."user_role_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_claim"("claim" "text", "uid" "uuid", "value" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data::jsonb, '{}'::jsonb) || 
    jsonb_build_object(claim, value)
  WHERE id = uid;
END;
$$;


ALTER FUNCTION "public"."set_claim"("claim" "text", "uid" "uuid", "value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  old_role text;
  new_role text;
BEGIN
  -- Get old and new roles for audit
  old_role := OLD.role;
  new_role := NEW.role;

  -- Update auth.users metadata
  UPDATE auth.users 
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object('user_role', NEW.role)
  WHERE id = NEW.id;

  -- Create audit log
  INSERT INTO audit_logs (
    action,
    entity,
    entity_id,
    user_id,
    old_data,
    new_data,
    "timestamp"
  ) VALUES (
    'UPDATE',
    'USER',
    NEW.id,
    NEW.id,
    jsonb_build_object('role', old_role),
    jsonb_build_object('role', new_role),
    NOW()
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_team_tags_overlap_ticket"("ticket_tags" "text"[], "user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM teams t
    JOIN team_members tm ON t.id = tm.team_id
    WHERE tm.user_id = user_id
    AND t.tags && ticket_tags
  );
END;
$$;


ALTER FUNCTION "public"."user_team_tags_overlap_ticket"("ticket_tags" "text"[], "user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."AuditLog" (
    "id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entityId" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "oldData" "jsonb",
    "newData" "jsonb" NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."AuditLog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Message" (
    "id" "text" NOT NULL,
    "content" "text" NOT NULL,
    "ticketId" "text" NOT NULL,
    "isInternal" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "contentHtml" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."Message" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Team" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tags" "text"[]
);


ALTER TABLE "public"."Team" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Ticket" (
    "id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "priority" "text" DEFAULT 'MEDIUM'::"text" NOT NULL,
    "customerId" "text" NOT NULL,
    "assignedToId" "text",
    "createdById" "text" NOT NULL,
    "tags" "text"[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "cleanupAt" timestamp(3) without time zone,
    "testBatchId" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "descriptionHtml" "text" DEFAULT ''::"text" NOT NULL,
    "lastUpdatedById" "text"
);


ALTER TABLE "public"."Ticket" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."User" (
    "id" "text" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "role" "public"."UserRole" DEFAULT 'CUSTOMER'::"public"."UserRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "cleanupAt" timestamp(3) without time zone,
    "metadata" "jsonb",
    "testBatchId" "text"
);


ALTER TABLE "public"."User" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_TeamMembers" (
    "A" "text" NOT NULL,
    "B" "text" NOT NULL
);


ALTER TABLE "public"."_TeamMembers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_prisma_migrations" (
    "id" character varying(36) NOT NULL,
    "checksum" character varying(64) NOT NULL,
    "finished_at" timestamp with time zone,
    "migration_name" character varying(255) NOT NULL,
    "logs" "text",
    "rolled_back_at" timestamp with time zone,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_steps_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."_prisma_migrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "old_data" "jsonb",
    "new_data" "jsonb" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ONLY "public"."audit_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "content" "text" NOT NULL,
    "ticket_id" "text" NOT NULL,
    "is_internal" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "content_html" "text" DEFAULT ''::"text" NOT NULL,
    "created_by_id" "uuid"
);

ALTER TABLE ONLY "public"."messages" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "team_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL
);

ALTER TABLE ONLY "public"."team_members" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "tags" "text"[]
);

ALTER TABLE ONLY "public"."teams" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "priority" "text" DEFAULT 'MEDIUM'::"text" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "assigned_to_id" "uuid",
    "created_by_id" "uuid" NOT NULL,
    "tags" "text"[],
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "cleanup_at" timestamp with time zone,
    "test_batch_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "description_html" "text" DEFAULT ''::"text" NOT NULL,
    "last_updated_by_id" "uuid"
);

ALTER TABLE ONLY "public"."tickets" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "role" "public"."user_role_enum" DEFAULT 'CUSTOMER'::"public"."user_role_enum" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "cleanup_at" timestamp with time zone,
    "metadata" "jsonb",
    "test_batch_id" "text"
);

ALTER TABLE ONLY "public"."users" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Message"
    ADD CONSTRAINT "Message_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Team"
    ADD CONSTRAINT "Team_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Ticket"
    ADD CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."_TeamMembers"
    ADD CONSTRAINT "_TeamMembers_AB_pkey" PRIMARY KEY ("A", "B");



ALTER TABLE ONLY "public"."_prisma_migrations"
    ADD CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id", "user_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_test_batch_id_key" UNIQUE ("email", "test_batch_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "AuditLog_entity_entityId_idx" ON "public"."AuditLog" USING "btree" ("entity", "entityId");



CREATE INDEX "AuditLog_timestamp_idx" ON "public"."AuditLog" USING "btree" ("timestamp");



CREATE INDEX "AuditLog_userId_idx" ON "public"."AuditLog" USING "btree" ("userId");



CREATE INDEX "Message_isInternal_idx" ON "public"."Message" USING "btree" ("isInternal");



CREATE INDEX "Message_ticketId_idx" ON "public"."Message" USING "btree" ("ticketId");



CREATE INDEX "Team_name_idx" ON "public"."Team" USING "btree" ("name");



CREATE INDEX "Ticket_assignedToId_idx" ON "public"."Ticket" USING "btree" ("assignedToId");



CREATE INDEX "Ticket_createdById_idx" ON "public"."Ticket" USING "btree" ("createdById");



CREATE INDEX "Ticket_customerId_idx" ON "public"."Ticket" USING "btree" ("customerId");



CREATE INDEX "Ticket_priority_idx" ON "public"."Ticket" USING "btree" ("priority");



CREATE INDEX "Ticket_status_idx" ON "public"."Ticket" USING "btree" ("status");



CREATE INDEX "Ticket_tags_idx" ON "public"."Ticket" USING "btree" ("tags");



CREATE INDEX "Ticket_testBatchId_idx" ON "public"."Ticket" USING "btree" ("testBatchId");



CREATE INDEX "Ticket_updatedAt_idx" ON "public"."Ticket" USING "btree" ("updatedAt");



CREATE UNIQUE INDEX "User_email_testBatchId_key" ON "public"."User" USING "btree" ("email", "testBatchId");



CREATE INDEX "User_role_idx" ON "public"."User" USING "btree" ("role");



CREATE INDEX "_TeamMembers_B_index" ON "public"."_TeamMembers" USING "btree" ("B");



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity", "entity_id");



CREATE INDEX "idx_audit_logs_timestamp" ON "public"."audit_logs" USING "btree" ("timestamp");



CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_messages_created_by" ON "public"."messages" USING "btree" ("created_by_id");



CREATE INDEX "idx_messages_is_internal" ON "public"."messages" USING "btree" ("is_internal");



CREATE INDEX "idx_messages_ticket_id" ON "public"."messages" USING "btree" ("ticket_id");



CREATE INDEX "idx_team_members_user_id" ON "public"."team_members" USING "btree" ("user_id");



CREATE INDEX "idx_teams_name" ON "public"."teams" USING "btree" ("name");



CREATE INDEX "idx_teams_tags" ON "public"."teams" USING "gin" ("tags");



CREATE INDEX "idx_tickets_assigned_created_customer" ON "public"."tickets" USING "btree" ("assigned_to_id", "created_by_id", "customer_id");



CREATE INDEX "idx_tickets_assigned_to_id" ON "public"."tickets" USING "btree" ("assigned_to_id");



CREATE INDEX "idx_tickets_created_by_id" ON "public"."tickets" USING "btree" ("created_by_id");



CREATE INDEX "idx_tickets_customer_id" ON "public"."tickets" USING "btree" ("customer_id");



CREATE INDEX "idx_tickets_priority" ON "public"."tickets" USING "btree" ("priority");



CREATE INDEX "idx_tickets_status" ON "public"."tickets" USING "btree" ("status");



CREATE INDEX "idx_tickets_tags" ON "public"."tickets" USING "gin" ("tags");



CREATE INDEX "idx_tickets_test_batch_id" ON "public"."tickets" USING "btree" ("test_batch_id");



CREATE INDEX "idx_tickets_updated_at" ON "public"."tickets" USING "btree" ("updated_at");



CREATE INDEX "idx_users_clade" ON "public"."users" USING "btree" ("role");



CREATE INDEX "users_role_idx" ON "public"."users" USING "btree" ("role");



CREATE OR REPLACE TRIGGER "sync_role_trigger" AFTER UPDATE OF "role" ON "public"."users" FOR EACH ROW WHEN (("old"."role" IS DISTINCT FROM "new"."role")) EXECUTE FUNCTION "public"."sync_role"();



ALTER TABLE ONLY "public"."AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."Message"
    ADD CONSTRAINT "Message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."Ticket"
    ADD CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."User"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Ticket"
    ADD CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."Ticket"
    ADD CONSTRAINT "Ticket_lastUpdatedById_fkey" FOREIGN KEY ("lastUpdatedById") REFERENCES "public"."User"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."_TeamMembers"
    ADD CONSTRAINT "_TeamMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Team"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."_TeamMembers"
    ADD CONSTRAINT "_TeamMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "fk_messages_created_by" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "public"."users"("id");



CREATE POLICY "Enable insert for authentication" ON "public"."User" FOR INSERT TO "anon" WITH CHECK ((("auth"."uid"())::"text" = "id"));



CREATE POLICY "Enable insert for service role" ON "public"."User" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Enable select for authenticated users" ON "public"."User" FOR SELECT TO "authenticated" USING (("id" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can view own user data" ON "public"."User" FOR SELECT TO "authenticated" USING ((("auth"."uid"())::"text" = "id"));



CREATE POLICY "admin_manager_ticket_access" ON "public"."tickets" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['ADMIN'::"public"."user_role_enum", 'MANAGER'::"public"."user_role_enum"]))))));



CREATE POLICY "agent_ticket_access" ON "public"."tickets" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'AGENT'::"public"."user_role_enum") AND (("tickets"."assigned_to_id" = "auth"."uid"()) OR ("tickets"."created_by_id" = "auth"."uid"()) OR "public"."user_team_tags_overlap_ticket"("tickets"."tags", "auth"."uid"()))))));



CREATE POLICY "customer_ticket_access" ON "public"."tickets" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'CUSTOMER'::"public"."user_role_enum") AND ("tickets"."customer_id" = "auth"."uid"())))));



ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "anon";




















































































































































































GRANT ALL ON FUNCTION "public"."set_claim"("claim" "text", "uid" "uuid", "value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_claim"("claim" "text", "uid" "uuid", "value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_role"() TO "service_role";


















GRANT ALL ON TABLE "public"."AuditLog" TO "authenticated";
GRANT ALL ON TABLE "public"."AuditLog" TO "anon";



GRANT ALL ON TABLE "public"."Message" TO "authenticated";
GRANT ALL ON TABLE "public"."Message" TO "anon";



GRANT ALL ON TABLE "public"."Team" TO "authenticated";
GRANT ALL ON TABLE "public"."Team" TO "anon";



GRANT ALL ON TABLE "public"."Ticket" TO "authenticated";
GRANT ALL ON TABLE "public"."Ticket" TO "anon";



GRANT ALL ON TABLE "public"."User" TO "authenticated";
GRANT ALL ON TABLE "public"."User" TO "anon";



GRANT ALL ON TABLE "public"."_TeamMembers" TO "authenticated";
GRANT ALL ON TABLE "public"."_TeamMembers" TO "anon";



GRANT ALL ON TABLE "public"."_prisma_migrations" TO "authenticated";
GRANT ALL ON TABLE "public"."_prisma_migrations" TO "anon";



GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "anon";



GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "anon";



GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "anon";



GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "anon";



GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "anon";



GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "anon";



























RESET ALL;
