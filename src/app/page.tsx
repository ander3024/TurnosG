import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  } else if (user.role === "admin") {
    redirect("/admin");
  } else {
    redirect("/calendar");
  }
}
