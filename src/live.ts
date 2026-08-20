process.stderr.write(
  "O live probe exige OAuth interativo no domínio HTTPS cadastrado. Use a aplicação implantada na Vercel; este script nunca roda em CI automaticamente.\n",
);
process.exitCode = 1;
