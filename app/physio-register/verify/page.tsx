import { redirect } from 'next/navigation';

// Redirect old /physio-register/verify to the main register page
export default function VerifyRedirectPage() {
    redirect('/physio-register');
}
