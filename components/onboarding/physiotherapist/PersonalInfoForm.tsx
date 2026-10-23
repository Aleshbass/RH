
import { z } from "zod";
import { motion } from "framer-motion";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { ChevronRight, ChevronDown } from "@/components/icons";

// Form schema
const personalInfoSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phoneNumber: z.string().min(10, "Please enter a valid phone number"),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
});

type PersonalInfoValues = z.infer<typeof personalInfoSchema>;

interface PersonalInfoFormProps {
  onNext: () => void;
}

export default function PersonalInfoForm({ onNext }: PersonalInfoFormProps) {
  const { data, updatePhysiotherapistData } = useOnboardingStore();
  const { physiotherapistData } = data;

  // Define form with React Hook Form and Zod validation
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<PersonalInfoValues>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      firstName: physiotherapistData.firstName || "",
      lastName: physiotherapistData.lastName || "",
      email: physiotherapistData.email || "",
      phoneNumber: physiotherapistData.phoneNumber || "",
      dateOfBirth: physiotherapistData.dateOfBirth || "",
      gender: physiotherapistData.gender || undefined,
    }
  });

  const onSubmit = handleSubmit((data) => {
    updatePhysiotherapistData(data);
    onNext();
  });

  const inputClasses = "block w-full h-14 px-4 pt-5 pb-2 text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] focus:bg-white transition-all duration-200 peer placeholder-transparent";
  const labelClasses = "absolute text-sm text-gray-500 duration-200 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-[#005b57]";

  return (
    <div className="w-full max-w-3xl mx-auto pb-24 sm:pb-0">
      <form onSubmit={onSubmit} className="space-y-6 sm:space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
          {/* First Name */}
          <div className="space-y-1">
            <div className="relative">
              <Controller
                control={control}
                name="firstName"
                render={({ field }) => (
                  <input
                    id="firstName"
                    type="text"
                    {...field}
                    placeholder="First Name"
                    className={`${inputClasses} ${errors.firstName ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                  />
                )}
              />
              <label htmlFor="firstName" className={labelClasses}>
                First Name
              </label>
            </div>
            {errors.firstName && (
              <p className="text-xs text-red-500 ml-1">{errors.firstName.message}</p>
            )}
          </div>

          {/* Last Name */}
          <div className="space-y-1">
            <div className="relative">
              <Controller
                control={control}
                name="lastName"
                render={({ field }) => (
                  <input
                    id="lastName"
                    type="text"
                    {...field}
                    placeholder="Last Name"
                    className={`${inputClasses} ${errors.lastName ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                  />
                )}
              />
              <label htmlFor="lastName" className={labelClasses}>
                Last Name
              </label>
            </div>
            {errors.lastName && (
              <p className="text-xs text-red-500 ml-1">{errors.lastName.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1 md:col-span-2">
            <div className="relative">
              <Controller
                control={control}
                name="email"
                render={({ field }) => (
                  <input
                    id="email"
                    type="email"
                    {...field}
                    placeholder="Email Address"
                    className={`${inputClasses} ${errors.email ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                  />
                )}
              />
              <label htmlFor="email" className={labelClasses}>
                Email Address
              </label>
            </div>
            {errors.email && (
              <p className="text-xs text-red-500 ml-1">{errors.email.message}</p>
            )}
          </div>

          {/* Phone Number */}
          <div className="space-y-1 md:col-span-2">
            <div className="relative">
              <Controller
                control={control}
                name="phoneNumber"
                render={({ field }) => (
                  <input
                    id="phoneNumber"
                    type="tel"
                    {...field}
                    placeholder="Phone Number"
                    className={`${inputClasses} ${errors.phoneNumber ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                  />
                )}
              />
              <label htmlFor="phoneNumber" className={labelClasses}>
                Phone Number
              </label>
            </div>
            {errors.phoneNumber && (
              <p className="text-xs text-red-500 ml-1">{errors.phoneNumber.message}</p>
            )}
          </div>

          {/* Date of Birth */}
          <div className="space-y-1">
            <div className="relative">
              <Controller
                control={control}
                name="dateOfBirth"
                render={({ field }) => (
                  <input
                    id="dateOfBirth"
                    type="date"
                    {...field}
                    value={field.value || ""}
                    className={`${inputClasses} pt-4`} // Adjust pt for date input
                  />
                )}
              />
              <label htmlFor="dateOfBirth" className="absolute text-xs text-gray-500 top-2 left-4">
                Date of Birth <span className="text-gray-400">(Optional)</span>
              </label>
            </div>
          </div>

          {/* Gender */}
          <div className="space-y-1">
            <div className="relative">
              <Controller
                control={control}
                name="gender"
                render={({ field }) => (
                  <select
                    id="gender"
                    {...field}
                    className={`${inputClasses} pt-4 appearance-none`}
                  >
                    <option value=""></option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                )}
              />
              <label htmlFor="gender" className={labelClasses}>
                Gender
              </label>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Mobile / Regular Desktop Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 sm:static sm:bg-transparent sm:border-0 sm:p-0 z-40">
          <div className="max-w-4xl mx-auto w-full">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto sm:min-w-[200px] h-14 sm:h-12 flex items-center justify-center gap-2 text-base sm:text-sm font-semibold bg-[#005b57] text-white rounded-xl sm:rounded-lg hover:bg-[#00443e] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:active:scale-100 shadow-lg sm:shadow-none ml-auto"
            >
              {isSubmitting ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
