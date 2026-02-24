const TARGET = "http://localhost:4000/api/student/submit";

const firstNames = ["Hikari", "Ren", "Akira", "Mika", "Sora", "Yuna", "Kaito"];
const lastNames = ["Tanaka", "Yamamoto", "Kobayashi", "Suzuki", "Nakamura"];
const theses = [
    "AI Weather Model",
    "IoT Flood Detection",
    "Blockchain Voting System",
    "Game Engine Optimization",
    "Smart Campus Monitoring"
];

function randomItem<T>(arr: T[] & { length: number }): T {
    const index = Math.floor(Math.random() * arr.length);
    return arr[index]!;
}

function randomPhone() {
    return `09${Math.floor(10000000 + Math.random() * 90000000)}`;
}

function generateStudent(i: number) {
    const first = randomItem(firstNames);
    const last = randomItem(lastNames);
    const id = `20${4000 + i}`; // ensures uniqueness per run

    return {
        id,
        personal_email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@gmail.com`,
        school_email: `${id}@umindanao.com`,
        last_name: last,
        first_name: first,
        middle_name: "N",
        suffix: "",
        nickname: first.slice(0, 4),
        birthdate: "2004-05-12",
        contact_num: randomPhone(),
        academics: {
            department: "DEPARTMENT OF COMPUTING EDUCATION",
            course: "BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY",
            major: "N/A",
            thesis: randomItem(theses),
        },
        guardian: {
            guardians_name: `${randomItem(firstNames)} ${last}`,
            relationship: "Brother",
        },
        province: "Davao del Norte",
        city: "City of Tagum",
        barangay: "Apokon",
    };
}

async function sendStudent(student: any) {
    const res = await fetch(TARGET, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(student),
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
}

async function runSimulation(count: number, parallel = true) {
    const start = Date.now();

    if (parallel) {
        const promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(sendStudent(generateStudent(i)));
        }
        await Promise.all(promises);
    } else {
        for (let i = 0; i < count; i++) {
            await sendStudent(generateStudent(i));
        }
    }

    console.log(`Sent ${count} students in ${Date.now() - start}ms`);
}

runSimulation(50, true);