import { cn } from "@/app/lib/utils/common";
import { Badge } from "./badge";
import { TicketStatus, TicketPriority } from "@/app/types/tickets";
import { UserRole } from "@prisma/client";

const statusStyles = {
  [TicketStatus.OPEN]: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  [TicketStatus.IN_PROGRESS]: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  [TicketStatus.PENDING]: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  [TicketStatus.RESOLVED]: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  [TicketStatus.CLOSED]: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const priorityStyles = {
  [TicketPriority.LOW]: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  [TicketPriority.MEDIUM]: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  [TicketPriority.HIGH]: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  [TicketPriority.URGENT]: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

const roleStyles = {
  [UserRole.CUSTOMER]: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  [UserRole.AGENT]: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  [UserRole.MANAGER]: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  [UserRole.ADMIN]: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status?: TicketStatus;
  priority?: TicketPriority;
  role?: UserRole;
}

export function StatusBadge({ 
  status, 
  priority, 
  role,
  className,
  ...props 
}: StatusBadgeProps) {
  const style = status ? statusStyles[status] 
               : priority ? priorityStyles[priority]
               : role ? roleStyles[role]
               : "bg-gray-100 text-gray-800";

  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-medium border-0",
        style,
        className
      )}
      {...props}
    />
  );
} 