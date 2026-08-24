import RequireAuth from "@/components/RequireAuth";
import UserLayout from "@/layouts/UserLayout";
import { Outlet } from "react-router";

const AppPageLayout = () => {
  return (
    <RequireAuth>
      <UserLayout>
        <Outlet />
      </UserLayout>
    </RequireAuth>
  );
};

export default AppPageLayout;
