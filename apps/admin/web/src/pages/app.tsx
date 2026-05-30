import UserLayout from "@/layouts/UserLayout";
import { Outlet } from "react-router";

const AppPageLayout = () => {
  return (
    <UserLayout>
      <Outlet />
    </UserLayout>
  );
};

export default AppPageLayout;
