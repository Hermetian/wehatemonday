'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/app/lib/utils/common";
import { useAuth } from "@/app/lib/auth/AuthContext";
import { Role } from "@/app/types/auth";

export function Navigation() {
  const pathname = usePathname();
  const { user } = useAuth();

  const isManager = (user?.role as Role) === 'MANAGER' || (user?.role as Role) === 'ADMIN';

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