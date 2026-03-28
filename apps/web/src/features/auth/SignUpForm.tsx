import { useState } from 'react';
import { useSignUp } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { TextInput, PasswordInput, Button, Stack, Alert } from '@mantine/core';
import { useForm } from '@mantine/form';

/**
 * Custom sign-up form using Clerk headless + Mantine
 */
export function SignUpForm() {
  const { signUp, setActive } = useSignUp();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
      password: (value) => (value.length >= 8 ? null : 'Password must be at least 8 characters'),
      firstName: (value) => (value.length > 0 ? null : 'First name is required'),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    if (!signUp) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await signUp.create({
        emailAddress: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate({ to: '/' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="md">
        {error && <Alert color="red">{error}</Alert>}

        <TextInput
          label="First Name"
          placeholder="John"
          required
          {...form.getInputProps('firstName')}
        />

        <TextInput label="Last Name" placeholder="Doe" {...form.getInputProps('lastName')} />

        <TextInput
          label="Email"
          placeholder="you@example.com"
          required
          {...form.getInputProps('email')}
        />

        <PasswordInput
          label="Password"
          placeholder="At least 8 characters"
          required
          {...form.getInputProps('password')}
        />

        <Button type="submit" fullWidth loading={isLoading}>
          Sign Up
        </Button>
      </Stack>
    </form>
  );
}
