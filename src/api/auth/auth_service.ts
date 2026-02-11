import prisma from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const jwt_sauce = process.env.JWT_SAUCE;

export async function handleLogin(id: string, pass: string) {
    const student = await prisma.studentAuth.findUnique({
        where: {
            student_number: parseInt(id)
        },
    });

    if (!student) {
        return {
            message: "Incorrect ID or Password"
        };
    }

    const hash = student.hashed_password;
    if (!hash) {
        return {
            message: "You're not verified yet, please wait for confirmation!"
        }
    }
    return await bcrypt.compare(pass, hash);
}

export async function jwtGen(user: object) {
    const token = jwt.sign(user, jwt_sauce as string, { expiresIn: '1h'});
    return token;
}