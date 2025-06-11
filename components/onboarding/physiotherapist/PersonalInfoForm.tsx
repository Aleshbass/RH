
import { z } from "zod";
import { motion } from "framer-motion";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOnboardingStore } from "@/stores/onboardingStore";

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

  const fadeInVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
        ease: "easeOut",
      },
    }),
  };

  return (
    <div className="max-w-xl mx-auto">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <form
          onSubmit={onSubmit}
          className="space-y-6"
        >
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-[#002e2c]">
              Personal Information
            </h2>
            <p className="text-[#005b57]">
              Let&apos;s start with your basic personal details
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {/* First Name */}
            <motion.div
              custom={0}
              initial="hidden"
              animate="visible"
              variants={fadeInVariants}
              className="space-y-2"
            >
              <label
                htmlFor="firstName"
                className="block text-sm font-medium text-[#002e2c]"
              >
                First Name *
              </label>
              <Controller
                control={control}
                name="firstName"
                render={({ field }) => (
                  <input
                    id="firstName"
                    type="text"
                    {...field}
                    className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${errors.firstName ? "border-red-500" : ""}`}
                  />
                )}
              />
              {errors.firstName && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.firstName.message}
                </p>
              )}
            </motion.div>

            {/* Last Name */}
            <motion.div
              custom={1}
              initial="hidden"
              animate="visible"
              variants={fadeInVariants}
              className="space-y-2"
            >
              <label
                htmlFor="lastName"
                className="block text-sm font-medium text-[#002e2c]"
              >
                Last Name *
              </label>
              <Controller
                control={control}
                name="lastName"
                render={({ field }) => (
                  <input
                    id="lastName"
                    type="text"
                    {...field}
                    className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${errors.lastName ? "border-red-500" : ""}`}
                  />
                )}
              />
              {errors.lastName && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.lastName.message}
                </p>
              )}
            </motion.div>

            {/* Email */}
            <motion.div
              custom={2}
              initial="hidden"
              animate="visible"
              variants={fadeInVariants}
              className="space-y-2"
            >
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#002e2c]"
              >
                Email *
              </label>
              <Controller
                control={control}
                name="email"
                render={({ field }) => (
                  <input
                    id="email"
                    type="email"
                    {...field}
                    className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${errors.email ? "border-red-500" : ""}`}
                  />
                )}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.email.message}
                </p>
              )}
            </motion.div>

            {/* Phone Number */}
            <motion.div
              custom={3}
              initial="hidden"
              animate="visible"
              variants={fadeInVariants}
              className="space-y-2"
            >
              <label
                htmlFor="phoneNumber"
                className="block text-sm font-medium text-[#002e2c]"
              >
                Phone Number *
              </label>
              <Controller
                control={control}
                name="phoneNumber"
                render={({ field }) => (
                  <input
                    id="phoneNumber"
                    type="tel"
                    {...field}
                    className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${errors.phoneNumber ? "border-red-500" : ""}`}
                  />
                )}
              />
              {errors.phoneNumber && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.phoneNumber.message}
                </p>
              )}
            </motion.div>

            {/* Date of Birth */}
            <motion.div
              custom={4}
              initial="hidden"
              animate="visible"
              variants={fadeInVariants}
              className="space-y-2"
            >
              <label
                htmlFor="dateOfBirth"
                className="block text-sm font-medium text-[#002e2c]"
              >
                Date of Birth <span className="text-gray-500">(Optional)</span>
              </label>
              <Controller
                control={control}
                name="dateOfBirth"
                render={({ field }) => (
                  <input
                    id="dateOfBirth"
                    type="date"
                    {...field}
                    value={field.value || ""}
                    className="block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50"
                  />
                )}
              />
            </motion.div>

            {/* Gender */}
            <motion.div
              custom={5}
              initial="hidden"
              animate="visible"
              variants={fadeInVariants}
              className="space-y-2"
            >
              <label
                htmlFor="gender"
                className="block text-sm font-medium text-[#002e2c]"
              >
                Gender
              </label>
              <Controller
                control={control}
                name="gender"
                render={({ field }) => (
                  <select
                    id="gender"
                    {...field}
                    className="block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50"
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                )}
              />
            </motion.div>
          </div>

          <motion.div
            custom={6}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="pt-5"
          >
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 flex justify-center items-center bg-gradient-to-r from-[#002e2c] to-[#005b57] hover:from-[#005b57] hover:to-[#007e78] text-white text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005b57] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Submitting...</span>
                </div>
              ) : (
                "Continue"
              )}
            </button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
}
