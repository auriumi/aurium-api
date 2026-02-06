import prisma from '../../config/prisma';
import bcrypt from 'bcrypt';

export async function handleLogin(id: number, pass: string) {
    const userAuth = await prisma.studentAuth.findUnique({
        where: {
            student_number: id
        },
        select: {
            hashed_password: true,
        }
    });

    if (!userAuth) {
        return {
            message: "Incorrect details given.."
        };
    }

    const hash = userAuth.hashed_password;
    if (!hash) {
        return {
            message: "You're not verified yet, please wait for confirmation!"
        }
    }
    return await bcrypt.compare(pass, hash);
}