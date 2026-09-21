import { UserBalanceTable } from "@/components/admin/UserBalanceTable";
import { mockUsers } from "@/lib/mock-data";

export default function AdminUsersPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-medium mb-6">Users</h1>
      <UserBalanceTable users={mockUsers} />
    </div>
  );
}
