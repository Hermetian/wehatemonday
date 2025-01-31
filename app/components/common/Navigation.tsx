'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/app/lib/utils/common";
import { useAuth } from "@/app/lib/auth/AuthContext";
import { Role } from "@/app/types/auth";
import { Button } from "../ui/button";
import { useState } from "react";
import { MarketplaceDialog } from "../marketplace/MarketplaceDialog";

export function Navigation() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [marketplaceDialogOpen, setMarketplaceDialogOpen] = useState(false);

  const isManager = (user?.role as Role) === 'MANAGER' || (user?.role as Role) === 'ADMIN';
  const isStaff = (user?.role as Role) === 'AGENT' || isManager;

  return (
    <>
      <nav className="flex space-x-4 items-center">
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
        
        {isStaff && (
          <Button 
            variant="outline" 
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setMarketplaceDialogOpen(true)}
          >
            Upload Marketplace Conversation
          </Button>
        )}
      </nav>

      <MarketplaceDialog
        open={marketplaceDialogOpen}
        onOpenChange={setMarketplaceDialogOpen}
      />
    </>
  );
}