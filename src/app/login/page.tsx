import { Suspense } from "react";
import BackofficeAuthClient from "./BackofficeAuthClient";

export default function LoginPage() {
  return (
    <Suspense>
      <BackofficeAuthClient />
    </Suspense>
  );
}
