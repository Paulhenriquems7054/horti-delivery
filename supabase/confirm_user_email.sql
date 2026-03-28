-- Confirma o email do usuário e verifica o status
UPDATE auth.users 
SET 
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  updated_at = now()
WHERE email = 'paulhenriquems7054@gmail.com';

-- Verifica o status
SELECT 
  email,
  email_confirmed_at IS NOT NULL as email_confirmado,
  created_at,
  last_sign_in_at
FROM auth.users 
WHERE email = 'paulhenriquems7054@gmail.com';
