import { loginSchema, type LoginInput } from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import type { z } from "zod";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/lib/auth";
import { applyApiError } from "@/lib/forms";
import { AuthHeading } from "./auth-heading";

export function LoginPage() {
  const login = useLogin();
  const form = useForm<z.input<typeof loginSchema>, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  // On success the cached user changes and <GuestOnly> redirects to ?next or home.
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
    } catch (error) {
      applyApiError(error, form.setError, ["email", "password"]);
    }
  });

  return (
    <>
      <AuthHeading title="Sign in" description="Welcome back to Brightloop One." />
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <FormAlert>{errors.root?.server?.message}</FormAlert>
        <FormField label="Email" error={errors.email}>
          <Input type="email" autoComplete="email" autoFocus {...form.register("email")} />
        </FormField>
        <FormField
          label="Password"
          error={errors.password}
          labelAside={
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          }
        >
          <Input type="password" autoComplete="current-password" {...form.register("password")} />
        </FormField>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New customer?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
