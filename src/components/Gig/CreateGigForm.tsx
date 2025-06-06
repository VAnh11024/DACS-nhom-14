import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trash2, Upload, AlertCircle } from "lucide-react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import React from "react";

const formSchema = z.object({
  title: z
    .string()
    .min(10, "Tiêu đề phải có ít nhất 10 ký tự")
    .max(1000, "Tiêu đề không được vượt quá 1000 ký tự"),
  description: z
    .string()
    .min(50, "Mô tả phải có ít nhất 50 ký tự")
    .max(10000, "Mô tả không được vượt quá 10000 ký tự"),
  price: z.coerce.number().min(0, "Giá trị phải lớn hơn hoặc bằng 0"),
  category: z.string().nonempty("Vui lòng chọn danh mục"),
  deliveryTime: z.coerce
    .number()
    .min(1, "Thời gian giao hàng phải ít nhất 1 ngày"),
});

type FormValues = z.infer<typeof formSchema>;
type Subcategory = {
  _id: string;
  name: string;
  subcategoryChildren?: Subcategory[];
};

type Category = {
  _id: string;
  name: string;
  subcategories: Subcategory[];
};

const steps = [
  { id: 1, title: "Tiêu đề" },
  { id: 2, title: "Mô tả" },
  { id: 3, title: "Danh mục" },
  { id: 4, title: "Thời gian" },
  { id: 5, title: "Giá" },
  { id: 6, title: "Ảnh" },
];

export default function CreateGigForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [visitedSteps, setVisitedSteps] = useState<number[]>([1]);
  const [errorSteps, setErrorSteps] = useState<number[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
    trigger,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      price: 0,
      category: "",
      deliveryTime: 0,
    },
  });

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const newFiles: File[] = [];
    const newUrls: string[] = [];

    Array.from(e.target.files).forEach((file) => {
      if (file.type.match(/image\/(jpeg|jpg|png)/i)) {
        if (file.size > 5 * 1024 * 1024) {
          setMediaError("Kích thước ảnh không được vượt quá 5MB");
          return;
        }
      } else if (file.type.match(/video\/(mp4|quicktime|x-msvideo|webm)/i)) {
        if (file.size > 50 * 1024 * 1024) {
          setMediaError("Kích thước video không được vượt quá 50MB");
          return;
        }
      } else {
        setMediaError(
          "Chỉ chấp nhận ảnh JPG, PNG hoặc video MP4, MOV, AVI, WEBM"
        );
        return;
      }
      newFiles.push(file);
      newUrls.push(URL.createObjectURL(file));
    });

    if (newFiles.length > 0) {
      setMediaError(null);
      setMediaFiles((prev) => [...prev, ...newFiles]);
      setMediaUrls((prev) => [...prev, ...newUrls]);
      // Remove step 6 from error steps if media were added
      if (errorSteps.includes(6)) {
        setErrorSteps(errorSteps.filter((step) => step !== 6));
      }
    }
  };

  const removeMedia = (index: number) => {
    const newFiles = [...mediaFiles];
    const newUrls = [...mediaUrls];
    URL.revokeObjectURL(newUrls[index]);
    newFiles.splice(index, 1);
    newUrls.splice(index, 1);
    setMediaFiles(newFiles);
    setMediaUrls(newUrls);
    // If no media left, set error
    if (newFiles.length === 0) {
      setMediaError("Vui lòng tải lên ít nhất một ảnh hoặc video");
      if (!errorSteps.includes(6)) {
        setErrorSteps([...errorSteps, 6]);
      }
    }
  };

  const validateStep = async (step: number) => {
    let isValid = true;
    switch (step) {
      case 1:
        isValid = await trigger("title");
        break;
      case 2:
        isValid = await trigger("description");
        break;
      case 3:
        isValid = await trigger("category");
        break;
      case 4:
        isValid = await trigger("deliveryTime");
        break;
      case 5:
        isValid = await trigger("price");
        break;
      case 6:
        isValid = mediaFiles.length > 0;
        if (!isValid) {
          setMediaError("Vui lòng tải lên ít nhất 1 ảnh hoặc video");
        }
        break;
    }
    return isValid;
  };

  const onSubmit = async (data: FormValues) => {
    const allSteps = [1, 2, 3, 4, 5, 6];
    const validationResults = await Promise.all(
      allSteps.map((step) => validateStep(step))
    );

    const invalidSteps = allSteps.filter(
      (_, index) => !validationResults[index]
    );
    setErrorSteps(invalidSteps);

    if (invalidSteps.length > 0) {
      setCurrentStep(invalidSteps[0]);
      toast.error("Vui lòng kiểm tra lại các thông tin", {
        position: "top-right",
        autoClose: 2000,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("description", data.description);
      formData.append("price", data.price.toString());
      formData.append("category_id", data.category);
      formData.append("duration", data.deliveryTime.toString());
      mediaFiles.forEach((file) => formData.append("files", file));
      await axios.post("http://localhost:5000/api/gigs/create", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        withCredentials: true,
      });
      toast.success("Đăng dịch vụ thành công!", {
        position: "top-right",
        autoClose: 2000,
      });
      setTimeout(() => {
        navigate("/seller-gigs");
      }, 2000);
    } catch (error: unknown) {
      console.log("Đăng dịch vụ thất bại:", error);
      toast.error("Đăng dịch vụ thất bại", {
        position: "top-right",
        autoClose: 2000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = async () => {
    const isCurrentStepValid = await validateStep(currentStep);

    if (!isCurrentStepValid) {
      if (!errorSteps.includes(currentStep)) {
        setErrorSteps([...errorSteps, currentStep]);
      }
      return;
    }

    // Remove current step from error steps if it was valid
    if (errorSteps.includes(currentStep)) {
      setErrorSteps(errorSteps.filter((step) => step !== currentStep));
    }

    if (currentStep < 6) {
      const nextStepNumber = currentStep + 1;
      setCurrentStep(nextStepNumber);
      if (!visitedSteps.includes(nextStepNumber)) {
        setVisitedSteps([...visitedSteps, nextStepNumber]);
      }
    }
  };

  const handleStepClick = async (step: number) => {
    // Optional: Validate current step before allowing navigation
    const isCurrentStepValid = await validateStep(currentStep);
    if (!isCurrentStepValid) {
      if (!errorSteps.includes(currentStep)) {
        setErrorSteps([...errorSteps, currentStep]);
      }
    } else if (errorSteps.includes(currentStep)) {
      setErrorSteps(errorSteps.filter((s) => s !== currentStep));
    }

    setCurrentStep(step);
    if (!visitedSteps.includes(step)) {
      setVisitedSteps([...visitedSteps, step]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextStep();
    }
  };

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/category");
        setCategories(res.data.data);
      } catch (error) {
        console.error("Không thể lấy danh sách danh mục:", error);
      }
    };
    fetchCategories();
  }, []);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 w-full">
      <ToastContainer />
      {isSubmitting && (
        <div className="fixed inset-0 bg-white bg-opacity-80 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center justify-center">
            <svg
              className="animate-spin h-12 w-12 text-indigo-600 mb-3"
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
            <p className="text-lg font-medium text-indigo-600">Đang xử lý...</p>
          </div>
        </div>
      )}

      {/* Steps Navigation */}
      <div className="mb-8">
        <div className="overflow-x-auto">
          <div className="flex items-center min-w-max">
            {steps.map((step) => (
              <div
                key={step.id}
                className="flex items-center cursor-pointer"
                onClick={() => handleStepClick(step.id)}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentStep === step.id
                      ? "bg-green-500 text-white"
                      : errorSteps.includes(step.id)
                      ? "bg-red-500 text-white"
                      : visitedSteps.includes(step.id)
                      ? "bg-blue-100 text-blue-800"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {errorSteps.includes(step.id) ? "!" : step.id}
                </div>
                <span
                  className={`ml-2 text-sm font-medium hidden sm:inline ${
                    currentStep === step.id
                      ? "text-green-500"
                      : errorSteps.includes(step.id)
                      ? "text-red-500"
                      : visitedSteps.includes(step.id)
                      ? "text-blue-800"
                      : "text-gray-500"
                  }`}
                >
                  {step.title}
                </span>
                {step.id < 6 && (
                  <div className="w-9 h-1 mx-7 bg-gray-300"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="min-h-[400px]">
        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">
              Tiêu đề dịch vụ
            </h3>
            <input
              type="text"
              placeholder="VD: Thiết kế logo chuyên nghiệp"
              className={`w-full rounded-md border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.title ? "border-red-500 bg-red-50" : "border-gray-300"
              }`}
              {...register("title")}
              onKeyPress={handleKeyPress}
            />
            {errors.title && (
              <p className="text-sm text-red-500 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.title.message}
              </p>
            )}
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                Tiếp theo
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">
              Mô tả chi tiết dịch vụ
            </h3>
            <textarea
              placeholder="Mô tả về quy chi tiết về sản phẩm bạn cung cấp..."
              className={`min-h-[200px] sm:min-h-[300px] w-full rounded-md border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.description
                  ? "border-red-500 bg-red-50"
                  : "border-gray-300"
              }`}
              {...register("description")}
              onKeyPress={handleKeyPress}
            />
            {errors.description && (
              <p className="text-sm text-red-500 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.description.message}
              </p>
            )}
            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-4">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                Tiếp theo
              </button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Danh mục</h3>
            <select
              className={`w-full rounded-md border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.category ? "border-red-500 bg-red-50" : "border-gray-300"
              }`}
              {...register("category")}
              onKeyPress={handleKeyPress}
            >
              <option value="">Chọn danh mục</option>
              {categories.map((cat) => (
                <React.Fragment key={cat._id}>
                  <option value="" disabled style={{ fontWeight: "bold" }}>
                    {cat.name}
                  </option>

                  {cat.subcategories &&
                    cat.subcategories.map((sub) => (
                      <React.Fragment key={sub._id}>
                        <option
                          value=""
                          disabled
                          style={{ fontWeight: "bold" }}
                        >
                          {"\u00A0"}
                          {"\u00A0"}
                          {"\u00A0"}
                          {"\u00A0"}
                          {sub.name}
                        </option>

                        {sub.subcategoryChildren &&
                          sub.subcategoryChildren.map((subChild) => (
                            <option key={subChild._id} value={subChild._id}>
                              {"\u00A0"}
                              {"\u00A0"}
                              {"\u00A0"}
                              {"\u00A0"}
                              {"\u00A0"}
                              {"\u00A0"}
                              {"\u00A0"}
                              {"\u00A0"}
                              {subChild.name}
                            </option>
                          ))}
                      </React.Fragment>
                    ))}
                </React.Fragment>
              ))}
            </select>
            {errors.category && (
              <p className="text-sm text-red-500 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.category.message}
              </p>
            )}
            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-4">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                Tiếp theo
              </button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">
              Thời gian hoàn thành (ngày)
            </h3>
            <input
              type="number"
              min="1"
              className={`w-full rounded-md border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.deliveryTime
                  ? "border-red-500 bg-red-50"
                  : "border-gray-300"
              }`}
              {...register("deliveryTime")}
              onKeyPress={handleKeyPress}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.currentTarget.select()}
              onChange={(e) => {
                if (e.target.value === "0") {
                  e.target.value = "";
                }
              }}
            />
            {errors.deliveryTime && (
              <p className="text-sm text-red-500 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.deliveryTime.message}
              </p>
            )}
            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-4">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                Tiếp theo
              </button>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">
              Giá dịch vụ (VNĐ)
            </h3>
            <div className="relative">
              <input
                type="number"
                min="1000"
                className={`w-full rounded-md border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.price ? "border-red-500 bg-red-50" : "border-gray-300"
                }`}
                {...register("price")}
                onKeyPress={handleKeyPress}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  if (e.target.value === "0") {
                    e.target.value = "";
                  }
                }}
              />
              {errors.price && (
                <div className="absolute left-0 top-full mt-1 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-2 py-1 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.price.message}
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-4">
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                Tiếp theo
              </button>
            </div>
          </div>
        )}

        {currentStep === 6 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">
              Ảnh hoặc video minh họa
            </h3>
            {mediaError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                <p className="text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {mediaError}
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {mediaUrls.map((url, index) => {
                const file = mediaFiles[index];
                if (file.type.startsWith("image/")) {
                  return (
                    <div
                      key={index}
                      className="relative overflow-hidden rounded-md border shadow-sm"
                    >
                      <img
                        src={url}
                        alt={`Preview ${index + 1}`}
                        className="aspect-video w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 flex rounded-full bg-red-500 p-1 text-white shadow"
                        onClick={() => removeMedia(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                } else if (file.type.startsWith("video/")) {
                  return (
                    <div
                      key={index}
                      className="relative overflow-hidden rounded-md border shadow-sm"
                    >
                      <video
                        src={url}
                        controls
                        className="aspect-video w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 flex rounded-full bg-red-500 p-1 text-white shadow"
                        onClick={() => removeMedia(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                }
                return null;
              })}
              <label
                htmlFor="media-upload"
                className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed ${
                  mediaError
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300 hover:bg-gray-50"
                } px-6 py-10 text-center text-sm ${
                  mediaError ? "text-red-500" : "text-gray-500"
                }`}
              >
                <Upload
                  className={`mb-2 h-6 w-6 ${
                    mediaError ? "text-red-500" : "text-gray-500"
                  }`}
                />
                <p>
                  Tải ảnh JPG/PNG (≤5MB) hoặc video MP4/MOV/AVI/WEBM (≤50MB)
                </p>
                <p className="text-xs mt-1">
                  Vui lòng tải lên ít nhất một ảnh hoặc video
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,video/mp4,video/quicktime,video/x-msvideo,video/webm"
                  multiple
                  className="hidden"
                  id="media-upload"
                  onChange={handleMediaUpload}
                />
              </label>
            </div>
            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-6">
              <button
                type="button"
                onClick={() => setCurrentStep(5)}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                Quay lại
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg w-full sm:w-auto disabled:opacity-70"
              >
                Hoàn thành
              </button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
