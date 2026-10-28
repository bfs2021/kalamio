import { useContext, useRef, useState } from "react";
import usePageTitle from "../common/usePageTitle";
import AnimationWrapper from "../common/page-animation";
import InputBox from "../components/input.component";
import toast from "react-hot-toast";
import api from "../common/api";
import { isValidPassword, PASSWORD_ERROR } from "../common/validation";
import { lookInSession, storeInSession } from "../common/session";
import { UserContext } from "../App";

const PasswordStrengthBar = ({ password }) => {
    const getStrength = (pwd) => {
        if (!pwd) return { level: 0, label: "", color: "" };
        let score = 0;
        if (pwd.length >= 6) score++;
        if (pwd.length >= 10) score++;
        if (/[a-z]/.test(pwd)) score++;
        if (/[A-Z]/.test(pwd)) score++;
        if (/\d/.test(pwd)) score++;
        if (/[^a-zA-Z0-9]/.test(pwd)) score++;

        if (score <= 2) return { level: 1, label: "Weak", color: "bg-red" };
        if (score <= 4) return { level: 2, label: "Fair", color: "bg-[#FF9800]" };
        return { level: 3, label: "Strong", color: "bg-[#4CAF50]" };
    };

    const { level, label, color } = getStrength(password);
    if (!password) return null;

    return (
        <div className="mb-4 -mt-2">
            <div className="flex gap-1.5 mb-1">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                            i <= level ? color : "bg-grey"
                        }`}
                    />
                ))}
            </div>
            <p className={`text-xs ${level === 1 ? 'text-red' : level === 2 ? 'text-[#FF9800]' : 'text-[#4CAF50]'}`}>
                {label}
            </p>
        </div>
    );
};

const ChangePassword = () => {

    usePageTitle('Change Password');

    let { userAuth, userAuth: { access_token }, setUserAuth } = useContext(UserContext);

    let changePasswordForm = useRef();

    const [newPassword, setNewPassword] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();

        let form = new FormData(changePasswordForm.current);
        let formData = {  };

        for(let [key, value] of form.entries()){
            formData[key] = value
        }

        let { currentPassword, newPassword: newPwd, confirmPassword } = formData;

        if(!currentPassword.length || !newPwd.length || !confirmPassword.length){
            return toast.error("Fill all the inputs")
        }

        if(!isValidPassword(currentPassword) || !isValidPassword(newPwd)){
            return toast.error(PASSWORD_ERROR)
        }

        if(newPwd !== confirmPassword){
            return toast.error("New password and confirm password do not match")
        }

        e.target.setAttribute("disabled", true);

        let loadingToast = toast.loading("Updating…");

        api.post("/change-password", { currentPassword, newPassword: newPwd })
        .then(({ data }) => {
            // The server revokes all sessions and issues a fresh pair for THIS device — persist it, or
            // the next refresh would present a now-deleted session's token and hard-log-out the very
            // device that just changed the password.
            if (data?.access_token) {
                try {
                    const s = JSON.parse(lookInSession("user") || "{}");
                    s.access_token = data.access_token;
                    if (data.refresh_token) s.refresh_token = data.refresh_token;
                    storeInSession("user", JSON.stringify(s));
                    if (userAuth) setUserAuth({ ...userAuth, access_token: data.access_token });
                } catch { /* keep going — worst case a re-login */ }
            }
            toast.dismiss(loadingToast);
            e.target.removeAttribute("disabled");
            changePasswordForm.current.reset();
            setNewPassword("");
            return toast.success("Password updated");
        })
        .catch(({ response }) => {
            toast.dismiss(loadingToast);
            e.target.removeAttribute("disabled");

            return toast.error(response.data.error);
        })

    }

    return(
        <AnimationWrapper>

            <form ref={changePasswordForm}>

                <h1 className="max-md:hidden">Change Password</h1>

                <div className="py-10 w-full md:max-w-[400px]">
                    <InputBox name="currentPassword" type="password" className="profile-edit-input" placeholder="Current Password" icon="lock_open" />
                    
                    <InputBox 
                        name="newPassword" 
                        type="password" 
                        className="profile-edit-input" 
                        placeholder="New Password" 
                        icon="lock" 
                        onChange={(e) => setNewPassword(e.target.value)}
                    />

                    <PasswordStrengthBar password={newPassword} />

                    <InputBox name="confirmPassword" type="password" className="profile-edit-input" placeholder="Confirm New Password" icon="lock" />

                    <button onClick={handleSubmit} className="btn-dark px-10" type="submit">Change Password</button>

                    <p className="text-sm text-dark-grey mt-4">
                        Forgot your password? <a href="/forgot-password" className="text-black underline">Reset it here</a>
                    </p>
                </div>

            </form>
        </AnimationWrapper>
    )
}

export default ChangePassword;