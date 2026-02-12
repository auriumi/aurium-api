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
                message: "Invalid credentials!"
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
        }
        return isMatch;

    } else {
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
        }
        return isMatch;
    }
}

export async function jwtGen(user: object) {
    const token = jwt.sign(user, jwt_sauce as string, { expiresIn: '1h'});
    return token;
}