import { resetPasswordSchema, type ResetPasswordInput } from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router";
import type { z } from "zod";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useResetPassword } from "@/lib/auth";
import { applyApiError, PASSWORD_HINT } from "@/lib/forms";
import { AuthHeading } from "./auth-heading";

/** Opened from the emailed link: /reset-password?token=... */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const reset = useResetPassword();
  const form = useForm<z.input<typeof resetPasswordSchema>, unknown, ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await reset.mutateAsync(values);
    } catch (error) {
      // Token errors (expired, used) have no matching input, so they show as the form error.
      applyApiError(error, form.setError, ["password", "confirmPassword"]);
    }
  });

  const backToLogin = (
    <p className="mt-6 text-center text-sm text-muted-foreground">
      <Link to="/login" className="font-medium text-primary hover:underline">
        Back to sign in
      </Link>
    </p>
  );

  if (!token) {
    return (
      <>
        <AuthHeading title="Choose a new password" />
        <FormAlert>
          This reset link is incomplete.{" "}
          <Link to="/forgot-password" className="font-medium underline">
            Request a new one
          </Link>
          .
        </FormAlert>
        {backToLogin}
      </>
    );
  }

  if (reset.isSuccess) {
    return (
      <>
        <AuthHeading title="Password updated" />
        <FormAlert variant="success">Your password was changed and you were signed out everywhere.</FormAlert>
        <Button asChild className="mt-4 w-full">
          <Link to="/login">Sign in</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Choose a new password" />
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <FormAlert>{errors.root?.server?.message ?? errors.token?.message}</FormAlert>
        <input type="hidden" {...form.register("token")} />
        <FormField label="New password" error={errors.password} hint={PASSWORD_HINT}>
          <Input type="password" autoComplete="new-password" autoFocus {...form.register("password")} />
        </FormField>
        <FormField label="Confirm new password" error={errors.confirmPassword}>
          <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
        </FormField>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Saving…" : "Set new password"}
        </Button>
      </form>
      {backToLogin}
    </>
  );
}
