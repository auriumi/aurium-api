import prisma from '../config/prisma';
import { createInterface } from 'readline/promises';
import bcrypt from 'bcrypt';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    try {
        const email = await rl.question('Enter email: ');
        const pass = await rl.question('Enter password: ');
        const first_name = await rl.question('Enter first name: ');
        const last_name = await rl.question('Enter last name: ');

        if (!email || !pass) {
            console.error('Email and Password shouldn\'t be empty!');
            return;
        }

        const hashed_password = await bcrypt.hash(pass, 10);

        const admin = await prisma.admin.create({
            data: {
                email: email,
                hashed_password: hashed_password,
                first_name: first_name,
                last_name: last_name
            }
        }); 

        if (!admin) {
            console.error("Something went wrong creating admin!");
        } else {
            console.log("Admin created succesfully!");
        }

    } catch (err) {
        console.error("Error creating admin: ", err);
    } finally {
        rl.close();
        await prisma.$disconnect();
    }
}

main();