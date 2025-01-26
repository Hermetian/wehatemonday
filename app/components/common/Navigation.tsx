'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthContext";
import { UserClade } from "@/lib/supabase/types";

export function Navigation() {
  const pathname = usePathname();
  const { clade } = useAuth();

  const isManager = clade === UserClade.MANAGER || clade === UserClade.ADMIN;

  return (
    <nav className="flex space-x-4">
      <Link
        href="/tickets"
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary",
          pathname?.startsWith("/tickets")
            ? "text-foreground"
            : "text-muted-foreground"
        )}
      >
        Tickets
      </Link>
      
      {isManager && (
        <Link
          href="/teams"
          className={cn(
            "text-sm font-medium transition-colors hover:text-primary",
            pathname?.startsWith("/teams")
              ? "text-foreground"
              : "text-muted-foreground"
          )}
        >
          Teams
        </Link>
      )}
      
      {/* ... other navigation items ... */}
    </nav>
  );
} 