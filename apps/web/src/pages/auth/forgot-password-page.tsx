import { forgotPasswordSchema, type ForgotPasswordInput } from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import type { z } from "zod";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForgotPassword } from "@/lib/auth";
import { applyApiError } from "@/lib/forms";
import { AuthHeading } from "./auth-heading";

export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const form = useForm<z.input<typeof forgotPasswordSchema>, unknown, ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await forgot.mutateAsync(values);
    } catch (error) {
      applyApiError(error, form.setError, ["email"]);
    }
  });

  return (
    <>
      <AuthHeading title="Reset your password" description="Enter your email and we'll send you a reset link." />
      {forgot.isSuccess ? (
        <FormAlert variant="success">{forgot.data.message}</FormAlert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormAlert>{errors.root?.server?.message}</FormAlert>
          <FormField label="Email" error={errors.email}>
            <Input type="email" autoComplete="email" autoFocus {...form.register("email")} />
          </FormField>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
