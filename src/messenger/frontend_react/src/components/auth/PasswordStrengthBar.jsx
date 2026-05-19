const levels = [
    {
        label: 'Слабый пароль',
        tip: 'Используйте минимум 8 символов разных типов',
        color: 'bg-red-500',
        width: 'w-1/3',
    },
    {
        label: 'Средний пароль',
        tip: 'Добавьте цифры, спецсимволы или заглавные буквы',
        color: 'bg-yellow-400',
        width: 'w-2/3',
    },
    {
        label: 'Надёжный пароль',
        tip: 'Отлично! Пароль достаточно сложный',
        color: 'bg-lime-400',
        width: 'w-full',
    },
];

function getStrength(password) {
    if (password.length < 8) return 0;
    let score = 0;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    if (score <= 1) return 0;
    if (score <= 3) return 1;
    return 2;
}

export default function PasswordStrengthBar({ password }) {
    if (!password) return null;

    const level = levels[getStrength(password)];

    return (
        <div className="mt-2 space-y-1">
            <div className="h-1.5 w-full rounded-full bg-zinc-800">
                <div className={`h-full rounded-full transition-all duration-300 ${level.color} ${level.width}`} />
            </div>
            <div className="flex items-baseline justify-between text-xs">
                <span className={level.color.replace('bg-', 'text-')}>{level.label}</span>
                <span className="text-zinc-500">{level.tip}</span>
            </div>
        </div>
    );
}
