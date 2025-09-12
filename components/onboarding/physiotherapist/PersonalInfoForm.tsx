
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

      },
    }),
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="text-center mb-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-[#002e2c]">Personal Information</h2>
            <p className="text-[#005b57] text-sm sm:text-base">Let&apos;s start with your basic personal details</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {/* First Name */}
            <motion.div
              custom={0}
              initial="hidden"
              animate="visible"
              variants={fadeInVariants}
              className="space-y-3"
            >
              <label
                htmlFor="firstName"
                className="block text-base font-semibold text-[#002e2c]"
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
                    placeholder="Enter your first name"
                    className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 ${errors.firstName ? "border-red-500" : ""}`}
                  />
                )}
              />
              {errors.firstName && (
                <p className="mt-2 text-sm text-red-500">
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
              className="space-y-3"
            >
              <label
                htmlFor="lastName"
                className="block text-base font-semibold text-[#002e2c]"
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
                    placeholder="Enter your last name"
                    className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 ${errors.lastName ? "border-red-500" : ""}`}
                  />
                )}
              />
              {errors.lastName && (
                <p className="mt-2 text-sm text-red-500">
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
              className="space-y-3"
            >
              <label
                htmlFor="email"
                className="block text-base font-semibold text-[#002e2c]"
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
                    placeholder="Enter your email address"
                    className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 ${errors.email ? "border-red-500" : ""}`}
                  />
                )}
              />
              {errors.email && (
                <p className="mt-2 text-sm text-red-500">
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
              className="space-y-3"
            >
              <label
                htmlFor="phoneNumber"
                className="block text-base font-semibold text-[#002e2c]"
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
                    placeholder="Enter your phone number"
                    className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 ${errors.phoneNumber ? "border-red-500" : ""}`}
                  />
                )}
              />
              {errors.phoneNumber && (
                <p className="mt-2 text-sm text-red-500">
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
              className="space-y-3"
            >
              <label
                htmlFor="dateOfBirth"
                className="block text-base font-semibold text-[#002e2c]"
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
                    className="block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20"
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
              className="space-y-3"
            >
              <label
                htmlFor="gender"
                className="block text-base font-semibold text-[#002e2c]"
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
                    className="block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20"
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
            className="pt-2"
          >
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 text-base font-semibold bg-[#005b57] text-white rounded-md hover:bg-[#00443e] transition-colors duration-200 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Continue to Professional Information"}
            </button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
}
