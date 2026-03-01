import prisma from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const jwt_sauce = process.env.JWT_SAUCE;

export async function handleLogin(id: string, pass: string, is_admin?: boolean) {

    if (is_admin) {
        const admin = await prisma.admin.findUnique({
            where: {
                email: id
            }
        });

        if (!admin) {
            return {
                success: false,
                reason: "Invalid credentials!"
            };
        }

        const hash = admin.hashed_password;
        const isMatch = await bcrypt.compare(pass, hash);
        
        if (isMatch) {
            await prisma.admin.update({
                where: {
                    email: id
                },
                data: {
                    last_login: new Date()
                }
            });
            return { success: true };
        }
        return { 
            success: false,
            reason: "Invalid credentials!"
        }

    } else {
        const student = await prisma.studentAuth.findUnique({
            where: {
                student_number: parseInt(id)
            },
        });

        if (!student) {
            return {
                success: false,
                reason: "Incorrect ID or Password"
            };
        }

        const hash = student.hashed_password;

        if (!hash) {
            return {
                success: false,
                reason: "You're not verified yet, please wait for confirmation!"
            }
        }

        const isMatch = await bcrypt.compare(pass, hash);
        if (isMatch) {
            await prisma.studentAuth.update({
                where: {
                    student_number: parseInt(id)
                },
                data: {
                    last_login: new Date()
                }
            });
            return { success: true };
        }

        return {
            success: false,
            reason: "Incorrect ID or Password"
        }
    }
}

export async function jwtGen(user: object) {
    const token = jwt.sign(user, jwt_sauce as string, { expiresIn: '1h'});
    return token;
}

export async function updatePassById(student_number: string, new_pass: string) {
    const hashed_pass = await bcrypt.hash(new_pass, 10);

    try {
        await prisma.studentAuth.update({
            where: {
                student_number: parseInt(student_number),
            },
            data: {
                hashed_password: hashed_pass
            }
        });    

        return { success: true }
    } catch (err) {
        console.error(err);
        return {
            success: false,
            reason: "Something went wrong in the server, please try again later."
        }
    }
}