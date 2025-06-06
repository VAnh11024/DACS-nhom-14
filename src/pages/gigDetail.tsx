import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  Heart,
  Star,
  Clock,
  MessageSquare,
  CheckCircle,
  FileText,
  MoreVertical,
  Lock,
  EyeIcon,
} from "lucide-react";
import { CustomerReview } from "../lib/reviewData";
import CustomerReviews from "../components/Review/CustomerReviews";
import { useFavoritesContext } from "../contexts/FavoritesContext";
import useRestrictedAccess from "../hooks/useRestrictedAccess";
import { useAuth } from "@clerk/clerk-react";
import { useUser } from "../hooks/useUser";

// Định nghĩa loại MediaItem cho mảng media
interface MediaItem {
  url: string;
  type: string;
  thumbnailUrl?: string;
}

// Cập nhật interface Gig để phản ánh cấu trúc dữ liệu từ API
interface GigDetail {
  _id: string;
  freelancerId: string;
  category_id: string;
  views: number;
  status: string;
  ordersCompleted: number;
  title: string;
  description: string;
  price: number;
  media: MediaItem[];
  rating?: {
    average: number;
    count: number;
  };
  duration?: number;
}

// Định nghĩa interface cho dữ liệu freelancer
interface Freelancer {
  _id: string;
  name: string;
  avatar?: string;
  level?: number;
  rating?: number;
  reviewCount?: number;
}

interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
}

const GigDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const reviewListRef = useRef<HTMLDivElement>(null);
  const [gig, setGig] = useState<GigDetail | null>(null);
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { isGigFavorited, toggleFavorite } = useFavoritesContext();
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [freelancer, setFreelancer] = useState<Freelancer | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportError, setReportError] = useState("");
  const navigate = useNavigate();
  const [selectedMediaType, setSelectedMediaType] = useState<string>("image");
  const [processedMedia, setProcessedMedia] = useState<MediaItem[]>([]);
  const [videoThumbnails, setVideoThumbnails] = useState<
    Record<string, string>
  >({});
  const [processingThumbnails, setProcessingThumbnails] =
    useState<boolean>(false);
  const { isLocked } = useRestrictedAccess();
  const { isSignedIn, userId } = useAuth();
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [isLoadingPayment, setIsLoadingPayment] = useState<boolean>(false);
  const { user } = useUser();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  // Xử lý query parameter reviewId
  useEffect(() => {
    // Lấy reviewId từ query parameters nếu có
    const queryParams = new URLSearchParams(location.search);
    const reviewId = queryParams.get("reviewId");
    if (reviewId) {
      // Đợi reviews được load xong trước khi cuộn
      const checkReviewsLoaded = setInterval(() => {
        if (reviews.length > 0 && reviewListRef.current) {
          clearInterval(checkReviewsLoaded);

          // Tìm review element cần scroll đến
          const reviewElement = document.getElementById(`review-${reviewId}`);
          if (reviewElement) {
            // Cuộn đến review
            setTimeout(() => {
              reviewElement.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });

              // Thêm hiệu ứng highlight
              reviewElement.classList.add("bg-yellow-50");
              setTimeout(() => {
                reviewElement.classList.add("transition-all", "duration-1000");
                reviewElement.classList.remove("bg-yellow-50");
              }, 2000);
            }, 500);
          }
        }
      }, 300);

      // Dọn dẹp timeout nếu component unmount
      return () => clearInterval(checkReviewsLoaded);
    }
  }, [location.search, reviews]);

  // Hàm trích xuất frame đầu tiên từ video làm thumbnail
  const extractVideoThumbnail = async (videoUrl: string): Promise<string> => {
    return new Promise<string>((resolve) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = videoUrl;
      video.muted = true;

      // Đặt thời gian ở giây thứ 1 (tránh màn hình đen ở frame 0)
      video.currentTime = 1;

      // Xử lý sự kiện khi dữ liệu video đã sẵn sàng
      const handleLoadedData = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            // Vẽ frame hiện tại của video lên canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Chuyển đổi canvas thành dạng dữ liệu URL (base64)
            const thumbnailUrl = canvas.toDataURL("image/jpeg");
            // Giải phóng bộ nhớ
            video.removeEventListener("loadeddata", handleLoadedData);
            video.src = "";

            resolve(thumbnailUrl);
          } else {
            console.error("Không thể lấy context từ canvas");
            resolve("/placeholder.jpg");
          }
        } catch (error) {
          console.error("Lỗi khi tạo thumbnail:", error);
          resolve("/placeholder.jpg");
        }
      };

      // Xử lý lỗi khi tải video
      const handleError = () => {
        console.error("Lỗi khi tải video:", videoUrl);
        video.removeEventListener("loadeddata", handleLoadedData);
        video.removeEventListener("error", handleError);
        resolve("/placeholder.jpg");
      };

      video.addEventListener("loadeddata", handleLoadedData);
      video.addEventListener("error", handleError);

      // Đặt timeout để đảm bảo không bị treo nếu video không tải được
      setTimeout(() => {
        if (!video.videoWidth) {
          console.warn("Timeout khi tải video:", videoUrl);
          video.removeEventListener("loadeddata", handleLoadedData);
          video.removeEventListener("error", handleError);
          resolve("/placeholder.jpg");
        }
      }, 5000); // 5 giây timeout
    });
  };

  // Xử lý chọn media để hiển thị
  const handleSelectMedia = (mediaItem: MediaItem) => {
    setSelectedImage(mediaItem.url);
    setSelectedMediaType(mediaItem.type);
  };

  // Xử lý media khi dữ liệu được tải
  useEffect(() => {
    if (!gig || !gig.media || gig.media.length === 0) return;

    const setupMedia = async () => {
      try {
        // Xác định video cần trích xuất thumbnail
        const videoItems = gig.media.filter(
          (item) => item.type === "video" && !item.thumbnailUrl
        );

        if (videoItems.length > 0) {
          // Xử lý media ban đầu với thumbnail mặc định
          const initialProcessed = gig.media.map((item) => {
            if (item.type === "video" && !item.thumbnailUrl) {
              return {
                ...item,
                thumbnailUrl: "/placeholder.jpg",
              };
            }
            return item;
          });

          setProcessedMedia(initialProcessed);

          // Trích xuất thumbnails cho tất cả video
          const thumbnails: Record<string, string> = {};

          for (const videoItem of videoItems) {
            try {
              const thumbnail = await extractVideoThumbnail(videoItem.url);
              thumbnails[videoItem.url] = thumbnail;

              // Cập nhật processedMedia với thumbnail mới
              setProcessedMedia((prev) =>
                prev.map((item) =>
                  item.url === videoItem.url
                    ? { ...item, thumbnailUrl: thumbnail }
                    : item
                )
              );
            } catch (error) {
              console.error("Lỗi khi trích xuất thumbnail:", error);
            }
          }

          setVideoThumbnails(thumbnails);
          setProcessingThumbnails(false);
        } else {
          // Không có video cần trích xuất thumbnail
          setProcessedMedia(gig.media);
        }
      } catch (error) {
        console.error("Lỗi khi xử lý media:", error);
        setProcessingThumbnails(false);
        setProcessedMedia(gig.media);
      }
    };

    setupMedia();
  }, [gig]);

  const naviagteToConversation = () => {
    if (freelancer && freelancer._id) {
      const getConversation = async () => {
        try {
          const response = await axios.post(
            `http://localhost:5000/api/conversation/create-or-get`,
            {
              to: freelancer._id,
              from: user?.user?._id,
            },
            {
              withCredentials: true,
            }
          );
          navigate(`/inbox/${response.data.conversation._id}`);
        } catch (error) {
          console.error("Error fetching conversation:", error);
        }
      };
      getConversation();
    } else {
      alert("Không tìm thấy thông tin người bán để liên hệ.");
    }
  };
  useEffect(() => {
    const fetchGigDetails = async () => {
      try {
        setIsLoading(true);

        // Use the correctly formatted endpoint for public gig detail viewing
        const response = await axios.get(
          `http://localhost:5000/api/${id}/get-gig-detail`
        );

        if (response.data && !response.data.error) {
          const gigData = response.data.gig;
          // Xử lý giá từ Decimal128
          if (
            gigData.price &&
            typeof gigData.price === "object" &&
            gigData.price.$numberDecimal
          ) {
            gigData.price = parseFloat(gigData.price.$numberDecimal);
          } else if (typeof gigData.price === "string") {
            gigData.price = parseFloat(gigData.price);
          }
          setGig(gigData);

          if (response.data.gig.media && response.data.gig.media.length > 0) {
            const firstMedia = response.data.gig.media[0];
            setSelectedImage(firstMedia.url);
            setSelectedMediaType(firstMedia.type);
          }

          // Get freelancer information if available
          if (response.data.freelancerId) {
            try {
              const userResponse = await axios.get(
                `http://localhost:5000/api/user/${response.data.freelancerId}`
              );

              if (userResponse.data && !userResponse.data.error) {
                const userData = userResponse.data.data || userResponse.data;

                setFreelancer({
                  _id: userData._id,
                  name: userData.name || "Freelancer",
                  avatar: userData.avatar || "/default-avatar.png",
                  level: userData.level || 1,
                  rating: userData.rating || 5.0,
                  reviewCount: userData.reviewCount || 0,
                });
              }
            } catch (error) {
              console.error("Lỗi khi tải thông tin người bán:", error);
              // Đặt giá trị mặc định nếu API user thất bại
              setFreelancer({
                _id: response.data.freelancerId,
                name: "Không tìm thấy người bán",
                avatar: "/default-avatar.png",
                level: 1,
                rating: 5.0,
                reviewCount: 0,
              });
            }
          }
        }
      } catch (error) {
        console.error("Lỗi khi tải chi tiết gig:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchGigDetails();
    }
  }, [id]);

  useEffect(() => {
    if (gig && id) {
      setIsFavorite(isGigFavorited(id));
    }
  }, [gig, id, isGigFavorited]);

  const handleToggleFavorite = async () => {
    if (!gig || !id) return;

    try {
      const result = await toggleFavorite(id);
      setIsFavorite(result.isFavorite);
    } catch (error) {
      console.error("Lỗi khi thay đổi trạng thái yêu thích:", error);
    }
  };

  const handleReport = async () => {
    try {
      setReportError("");

      // Kiểm tra độ dài của description
      if (reportDescription.length > 255) {
        setReportError("Mô tả chi tiết không được vượt quá 255 ký tự");
        return;
      }

      // Lấy ID từ URL và làm sạch
      const gigId = id?.split("/").pop()?.trim();

      const response = await axios.post(
        `http://localhost:5000/api/complaint/${gigId}/create`,
        {
          reason: reportReason,
          description: reportDescription,
        },
        {
          withCredentials: true,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (response.data && !response.data.error) {
        setIsReportModalOpen(false);
        setReportReason("");
        setReportDescription("");
        toast.success("Báo cáo đã được gửi thành công!", {
          position: "top-right",
          autoClose: 2000,
        });
      }
    } catch (error: unknown) {
      const apiError = error as ApiError;
      console.error("Lỗi khi gửi báo cáo:", error);
      const errorMessage =
        apiError.response?.data?.message || "Có lỗi xảy ra khi báo cáo";
      setReportError(errorMessage);
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 2000,
      });
    }
  };

  const fetchReviews = async () => {
    try {
      const response = await axios.get(
        `http://localhost:5000/api/review/gig/${id}/frontend`
      );
      if (response.data && !response.data.error) {
        setReviews(response.data.reviews);
      }
    } catch (error) {
      console.error("Lỗi khi tải đánh giá:", error);
    }
  };

  // Lấy dữ liệu reviews khi component được tải
  useEffect(() => {
    if (id) {
      fetchReviews();
    }
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  if (!gig) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Không tìm thấy dịch vụ</h1>
        <p className="mb-8">
          Dịch vụ bạn đang tìm kiếm có thể đã bị xóa hoặc không tồn tại.
        </p>
        <Link
          to="/dashboard"
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-md transition-colors"
        >
          Quay lại trang chính
        </Link>
      </div>
    );
  }
  const handleOrder = async () => {
    if (!gig || !id) return;

    if (!isSignedIn) {
      navigate("/sign-in");
      return;
    }

    if (isLocked) {
      alert("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.");
      return;
    }

    setIsLoadingPayment(true);
    try {
      const response = await axios.post(
        "http://localhost:5000/api/payment/create",
        {
          amount: gig.price,
          orderId: `ORDER_${gig._id}_${Date.now()}`,
          gigId: gig._id,
          requirements: "", // Có thể thêm input để người dùng nhập requirements
        },
        {
          withCredentials: true,
        }
      );

      if (response.data) {
        window.location.href = response.data;
      } else {
        throw new Error("Không nhận được URL thanh toán");
      }
    } catch (error) {
      console.error("Lỗi khi tạo thanh toán:", error);
      alert("Đã xảy ra lỗi khi tạo thanh toán. Vui lòng thử lại.");
    } finally {
      setIsLoadingPayment(false);
    }
  };
  return (
    <div className="container mx-auto px-4 py-16 max-w-7xl">
      <ToastContainer />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Content Column - Takes 2/3 on large screens */}
        <div className="lg:col-span-2">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
              {gig.title}
            </h1>
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Report Modal */}
          {isReportModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Báo cáo dịch vụ</h2>
                  <button
                    onClick={() => setIsReportModalOpen(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                {reportError && (
                  <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
                    {reportError}
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lý do
                  </label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="">Chọn lý do</option>
                    <option value="dịch vụ bị cấm">Dịch vụ bị cấm</option>
                    <option value="nội dung không phù hợp">
                      Nội dung không phù hợp
                    </option>
                    <option value="không nguyên bản">Không nguyên bản</option>
                    <option value="vi phạm quyền sở hữu trí tuệ">
                      Vi phạm quyền sở hữu trí tuệ
                    </option>
                    <option value="khác">Khác</option>
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mô tả chi tiết
                  </label>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => {
                      // Giới hạn input không quá 255 ký tự
                      if (e.target.value.length <= 255) {
                        setReportDescription(e.target.value);
                      }
                    }}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    rows={4}
                    maxLength={255}
                    placeholder="Vui lòng mô tả chi tiết vấn đề bạn gặp phải (tối đa 255 ký tự)..."
                  ></textarea>
                  <div className="text-sm text-gray-500 mt-1">
                    {reportDescription.length}/255 ký tự
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setIsReportModalOpen(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleReport}
                    className="px-4 py-2 text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors"
                    disabled={!reportReason || !reportDescription}
                  >
                    Báo cáo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Seller Info - Top */}
          <Link to={`/profile/${freelancer?._id}`}>
            <div className="flex items-center mb-6 gap-3">
              {freelancer ? (
                <>
                  <img
                    src={freelancer.avatar || "https://via.placeholder.com/40"}
                    alt={freelancer.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-medium">{freelancer.name}</p>
                    <div className="flex items-center justify-start">
                      <EyeIcon className="w-4 h-4" />
                      <span className="text-sm font-medium ml-1 text-black">
                        Lượt xem:
                      </span>
                      <div className="text-sm font-medium ml-1 text-black">
                        {gig.views}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-20 mb-2 animate-pulse"></div>
                    <div className="h-3 bg-gray-200 rounded w-24 animate-pulse"></div>
                  </div>
                </div>
              )}
            </div>
          </Link>
          {/* Main Image Gallery */}
          <div className="mb-6">
            <div className="mb-4 aspect-video bg-gray-100 rounded-lg overflow-hidden">
              {selectedImage && selectedMediaType === "video" ? (
                <video
                  src={selectedImage}
                  className="w-full h-full object-cover"
                  controls
                  autoPlay
                />
              ) : (
                <img
                  src={selectedImage || gig.media[0]?.url || ""}
                  alt={gig.title}
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {/* Thumbnails */}
            <div className="grid grid-cols-5 gap-2">
              {processedMedia.map((mediaItem, index) => (
                <div
                  key={index}
                  className={`aspect-square rounded-md overflow-hidden cursor-pointer border-2 relative ${
                    selectedImage === mediaItem.url
                      ? "border-green-500"
                      : "border-transparent"
                  }`}
                  onClick={() => handleSelectMedia(mediaItem)}
                >
                  {mediaItem.type === "video" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 z-10">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="white"
                        className="w-6 h-6"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                        />
                      </svg>
                    </div>
                  )}
                  <img
                    src={
                      mediaItem.type === "image"
                        ? mediaItem.url
                        : mediaItem.thumbnailUrl || mediaItem.url
                    }
                    alt={`${gig.title} - ${
                      mediaItem.type === "video" ? "video" : "ảnh"
                    } ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* About This Gig */}
          <div className="mb-10">
            <h2 className="text-xl font-bold mb-4">Giới thiệu về dịch vụ</h2>
            <div className="text-gray-700 whitespace-pre-line">
              {gig.description}
            </div>
          </div>

          {/* About The Seller */}
          <div className="bg-gray-50 p-6 rounded-lg mb-10">
            <h2 className="text-xl font-bold mb-4">Về người bán</h2>
            <Link to={`/profile/${freelancer?._id}`}>
              <div className="flex items-center gap-4 mb-6">
                {freelancer ? (
                  <>
                    <img
                      src={
                        freelancer.avatar || "https://via.placeholder.com/40"
                      }
                      alt={freelancer.name}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-medium text-lg">{freelancer.name}</p>
                      <p className="text-gray-500">
                        @{freelancer.name}
                      </p>

                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-4 w-full">
                    <div className="w-16 h-16 bg-gray-200 rounded-full animate-pulse"></div>
                    <div className="w-full">
                      <div className="h-5 bg-gray-200 rounded w-32 mb-2 animate-pulse"></div>
                      <div className="h-4 bg-gray-200 rounded w-24 mb-2 animate-pulse"></div>
                      <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                    </div>
                  </div>
                )}
              </div>
            </Link>
            <button
              onClick={naviagteToConversation}
              className={`border border-gray-300 rounded-md px-4 py-2 text-gray-700 ${
                isLocked ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100"
              } transition-colors`}
              disabled={isLocked}
            >
              {isLocked ? (
                <span className="flex items-center">
                  <Lock size={16} className="mr-2" />
                  Chức năng bị khóa
                </span>
              ) : (
                "Liên hệ với tôi"
              )}
            </button>
          </div>

          {/* Customer Reviews */}
          <div className="mb-10">
            <h2 className="text-xl font-bold mb-4">Đánh giá của khách hàng</h2>
            {reviews.length > 0 ? (
              <CustomerReviews
                reviews={reviews}
                isGigOwner={userId === gig.freelancerId}
              />
            ) : (
              <div className="bg-white rounded-lg shadow-sm p-6 text-center">
                <p className="text-gray-500">
                  Chưa có đánh giá nào cho dịch vụ này
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Order Box */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-lg shadow-md sticky top-40">
            {/* Package Options (Tabs) */}
            <div className="flex border-b overflow-auto scrollbar-hide">
              <div className="item-center px-4 py-3 font-medium border-b-2 border-green-500 text-green-500 flex-1">
                CƠ BẢN
              </div>
            </div>

            {/* Package Content */}
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold">Giá dịch vụ : </h3>
                <span className="font-bold text-xl">
                  {new Intl.NumberFormat("vi-VN", {
                    style: "currency",
                    currency: "VND",
                  }).format(gig.price)}
                </span>
              </div>

              <p className="text-gray-700 mb-4 text-sm">
                {gig.description.substring(0, 100)}...
              </p>

              {/* Details */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-gray-500" />
                  <span className="text-sm">
                    {gig.duration || 3} ngày giao hàng
                  </span>
                </div>

                {/* More features can be added here */}
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-gray-500" />
                  <span className="text-sm">Hỗ trợ không giới hạn</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-gray-500" />
                  <span className="text-sm">Bàn giao đầy đủ mã nguồn</span>
                </div>
              </div>

              {/* Order Button - Điều kiện hiển thị dựa trên trạng thái tài khoản */}
              {!isSignedIn ? (
                <Link
                  to="/sign-in"
                  className="block bg-green-500 hover:bg-green-600 text-white text-center font-medium py-3 rounded-md transition-colors w-full"
                >
                  Đăng nhập để đặt dịch vụ
                </Link>
              ) : isLocked ? (
                <div className="block bg-gray-400 text-white text-center font-medium py-3 rounded-md w-full flex items-center justify-center">
                  <Lock size={16} className="mr-2" />
                  Tài khoản đã bị khóa
                </div>
              ) : (
                <button
                  onClick={handleOrder}
                  className="block bg-green-500 hover:bg-green-600 text-white text-center font-medium py-3 rounded-md transition-colors w-full"
                >
                  Đặt dịch vụ ngay
                </button>
              )}
            </div>

            {/* Contact Seller */}
            <div className="border-t p-6 space-y-3">
              {/* Nút Yêu thích - vẫn hiển thị nhưng sẽ chuyển hướng đến đăng nhập nếu chưa đăng nhập */}
              {!isSignedIn ? (
                <Link
                  to="/sign-in"
                  className="text-gray-700 hover:text-gray-900 flex items-center justify-center gap-2 font-medium w-full"
                >
                  <Heart size={18} />
                  <span>Đăng nhập để lưu</span>
                </Link>
              ) : (
                <button
                  onClick={handleToggleFavorite}
                  className={`text-gray-700 hover:text-gray-900 flex items-center justify-center gap-2 font-medium w-full ${
                    isLocked ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  disabled={isLocked}
                >
                  <Heart
                    size={18}
                    className={isFavorite ? "fill-red-500 text-red-500" : ""}
                  />
                  <span>
                    {isFavorite ? "Đã lưu vào yêu thích" : "Lưu vào yêu thích"}
                  </span>
                </button>
              )}

              {/* Gửi yêu cầu tùy chỉnh - chỉ cho phép người dùng không bị khóa */}
              {!isSignedIn ? (
                <Link
                  to="/sign-in"
                  className="flex items-center justify-center gap-2 text-green-500 hover:text-green-600 font-medium w-full"
                >
                  <FileText size={18} />
                  <span>Đăng nhập để gửi yêu cầu</span>
                </Link>
              ) : isLocked ? (
                <div className="flex items-center justify-center gap-2 text-gray-400 font-medium w-full cursor-not-allowed">
                  <Lock size={18} />
                  <span>Tài khoản đã bị khóa</span>
                </div>
              ) : (
                <button
                  onClick={naviagteToConversation}
                  className="flex items-center justify-center gap-2 text-green-500 hover:text-green-600 font-medium w-full"
                >
                  <FileText size={18} />
                  <span>Liên hệ với tôi</span>
                </button>
              )}
            </div>

            {/* Thông báo nếu tài khoản bị khóa */}
            {isLocked && (
              <div className="border-t border-orange-200 bg-orange-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="text-orange-500 mt-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 3.813-1.874 2.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                      />
                    </svg>
                  </div>
                  <div className="text-sm text-orange-700">
                    <p className="font-medium">Tài khoản của bạn đã bị khóa</p>
                    <p>
                      Bạn chỉ có thể xem thông tin dịch vụ. Để sử dụng đầy đủ
                      các chức năng, vui lòng liên hệ quản trị viên.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GigDetailPage;
