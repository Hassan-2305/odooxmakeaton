import { registerSchema, type RegisterInput } from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import type { z } from "zod";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRegister } from "@/lib/auth";
import { applyApiError, PASSWORD_HINT } from "@/lib/forms";
import { AuthHeading } from "./auth-heading";

export function RegisterPage() {
  const register = useRegister();
  const form = useForm<z.input<typeof registerSchema>, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await register.mutateAsync(values);
    } catch (error) {
      applyApiError(error, form.setError, ["name", "email", "password", "confirmPassword"]);
    }
  });

  return (
    <>
      <AuthHeading title="Create your account" description="Manage your subscriptions, invoices and payments." />
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <FormAlert>{errors.root?.server?.message}</FormAlert>
        <FormField label="Full name" error={errors.name}>
          <Input autoComplete="name" autoFocus {...form.register("name")} />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <Input type="email" autoComplete="email" {...form.register("email")} />
        </FormField>
        <FormField label="Password" error={errors.password} hint={PASSWORD_HINT}>
          <Input type="password" autoComplete="new-password" {...form.register("password")} />
        </FormField>
        <FormField label="Confirm password" error={errors.confirmPassword}>
          <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
        </FormField>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
