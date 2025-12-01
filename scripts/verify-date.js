
const appointmentStart = 1764504000000;
const now = Date.now();
const diff = appointmentStart - now;
const hours = diff / (1000 * 60 * 60);

console.log("Current Time:", new Date(now).toISOString(), now);
console.log("Appointment Start:", new Date(appointmentStart).toISOString(), appointmentStart);
console.log("Difference (ms):", diff);
console.log("Hours until start:", hours);

if (hours < 0) {
    console.log("Appointment is in the PAST.");
} else {
    console.log("Appointment is in the FUTURE.");
}
