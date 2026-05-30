import AuthLayout from "@/layouts/AuthLayout";
import { Outlet } from "react-router";

const AuthPageLayout = () => {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
};

export default AuthPageLayout;
