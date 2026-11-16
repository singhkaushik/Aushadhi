import LoginForm from "@/components/LoginForm";
import { defaultPasswordInUse } from "@/lib/auth";

export default function Login() {
  return <LoginForm showDefaultHint={defaultPasswordInUse()} />;
}
